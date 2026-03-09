import { Client } from '@modelcontextprotocol/client';
import type { FeedbackSubmitRequest } from '@modelcontextprotocol/core';
import { InMemoryTransport } from '@modelcontextprotocol/core';
import { McpServer, Server } from '@modelcontextprotocol/server';
import { describe, expect, test, vi } from 'vitest';

describe('Client Experience Feedback', () => {
    test('server declares feedback capability and client submits feedback successfully', async () => {
        const feedbackHandler = vi.fn();

        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['usability', 'reliability', 'documentation', 'efficiency', 'interoperability']
                    }
                }
            }
        );
        server.onfeedback = feedbackHandler;

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        budget: { maxTokensPerMonth: 1000, maxSubmissionsPerMonth: 10 }
                    }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const feedbackParams: FeedbackSubmitRequest['params'] = {
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [
                {
                    category: 'usability',
                    toolName: 'search_files',
                    severity: 4,
                    subcategory: 'parameters',
                    confusedWith: 'find_files',
                    observation: 'Parameters serve similar purposes but expect different formats.'
                },
                {
                    category: 'efficiency',
                    toolName: 'get_record',
                    severity: 3,
                    subcategory: 'needs_batch_mode',
                    sessionMetrics: {
                        totalCalls: 47,
                        successfulCalls: 46,
                        failedCalls: 1,
                        retriedCalls: 0
                    }
                }
            ],
            rollupMetrics: {
                totalToolCalls: 156,
                uniqueToolsUsed: 8,
                overallSuccessRate: 0.82,
                toolMetrics: {
                    search_files: { calls: 23, successRate: 0.35, avgRetries: 2.1 },
                    get_record: { calls: 47, successRate: 0.98, avgRetries: 0.0 }
                }
            }
        };

        const result = await client.submitFeedback(feedbackParams);

        expect(result.accepted).toBe(true);
        expect(feedbackHandler).toHaveBeenCalledOnce();
        expect(feedbackHandler).toHaveBeenCalledWith(feedbackParams);

        await client.close();
        await server.close();
    });

    test('McpServer high-level API supports feedback via onFeedback', async () => {
        const feedbackHandler = vi.fn();

        const server = new McpServer(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['usability', 'reliability']
                    }
                }
            }
        );
        server.onFeedback(feedbackHandler);

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: { enabled: true }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [
                {
                    category: 'reliability',
                    toolName: 'flaky_tool',
                    severity: 5,
                    subcategory: 'intermittent_failure',
                    observation: 'Tool returns errors approximately 40% of the time.'
                }
            ]
        });

        expect(result.accepted).toBe(true);
        expect(feedbackHandler).toHaveBeenCalledOnce();

        await client.close();
        await server.close();
    });

    test('feedback with interoperability category uses toolNames array', async () => {
        const feedbackHandler = vi.fn();

        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['interoperability']
                    }
                }
            }
        );
        server.onfeedback = feedbackHandler;

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: { enabled: true }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [
                {
                    category: 'interoperability',
                    toolNames: ['create_item', 'validate_item'],
                    severity: 3,
                    subcategory: 'ordering_sensitive',
                    observation: 'validate_item must be called before create_item but this is not documented.'
                }
            ]
        });

        expect(result.accepted).toBe(true);
        expect(feedbackHandler).toHaveBeenCalledOnce();
        const receivedItems = feedbackHandler.mock.calls[0][0].items;
        expect(receivedItems[0].toolNames).toEqual(['create_item', 'validate_item']);

        await client.close();
        await server.close();
    });

    test('feedback works without optional fields', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'weekly',
                        categories: ['usability']
                    }
                }
            }
        );
        server.onfeedback = vi.fn();

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: { enabled: true }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        // Minimal feedback: no rollupMetrics, no observation, no sessionMetrics
        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'weekly',
            items: [
                {
                    category: 'usability',
                    toolName: 'some_tool',
                    severity: 2,
                    subcategory: 'naming'
                }
            ]
        });

        expect(result.accepted).toBe(true);

        await client.close();
        await server.close();
    });

    test('server without feedback capability still works normally', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    logging: {}
                }
            }
        );

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: { enabled: true }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        // Server works normally — client just can't submit feedback
        // The server capabilities won't include feedback
        const serverCaps = client.getServerCapabilities();
        expect(serverCaps?.feedback).toBeUndefined();

        await client.close();
        await server.close();
    });

    test('feedback with all severity levels validates correctly', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['documentation']
                    }
                }
            }
        );
        server.onfeedback = vi.fn();

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            { capabilities: { feedback: { enabled: true } } }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        // Submit feedback with all severity levels (1-5)
        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [1, 2, 3, 4, 5].map(severity => ({
                category: 'documentation' as const,
                toolName: `tool_${severity}`,
                severity,
                subcategory: 'missing' as const
            }))
        });

        expect(result.accepted).toBe(true);

        await client.close();
        await server.close();
    });

    test('feedback supports cross-server tool confusion signaling', async () => {
        const feedbackHandler = vi.fn();

        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['usability']
                    }
                }
            }
        );
        server.onfeedback = feedbackHandler;

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            { capabilities: { feedback: { enabled: true } } }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [
                {
                    category: 'usability',
                    toolName: 'search',
                    severity: 4,
                    subcategory: 'naming',
                    confusedWith: 'search',
                    confusedWithExternal: true,
                    observation: 'Tool has the same name as a tool from a different server, causing confusion.'
                }
            ]
        });

        expect(result.accepted).toBe(true);
        const receivedItem = feedbackHandler.mock.calls[0][0].items[0];
        expect(receivedItem.confusedWithExternal).toBe(true);
        expect(receivedItem.confusedWith).toBe('search');

        await client.close();
        await server.close();
    });

    test('on-demand feedback bypasses cadence and is flagged correctly', async () => {
        const feedbackHandler = vi.fn();

        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'monthly',
                        categories: ['usability', 'reliability']
                    }
                }
            }
        );
        server.onfeedback = feedbackHandler;

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            { capabilities: { feedback: { enabled: true } } }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        // User-initiated on-demand feedback during active session
        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            onDemand: true,
            items: [
                {
                    category: 'reliability',
                    toolName: 'deploy_service',
                    severity: 5,
                    subcategory: 'intermittent_failure',
                    observation: 'Tool fails silently without returning an error status.'
                }
            ]
        });

        expect(result.accepted).toBe(true);
        expect(feedbackHandler).toHaveBeenCalledOnce();
        expect(feedbackHandler.mock.calls[0][0].onDemand).toBe(true);
        expect(feedbackHandler.mock.calls[0][0].items[0].severity).toBe(5);

        await client.close();
        await server.close();
    });

    test('feedback supports capability_gap category for new use case discovery', async () => {
        const feedbackHandler = vi.fn();

        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['capability_gap']
                    }
                }
            }
        );
        server.onfeedback = feedbackHandler;

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            { capabilities: { feedback: { enabled: true } } }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const result = await client.submitFeedback({
            feedbackVersion: '2026-03-08',
            generatedAt: new Date().toISOString(),
            cadence: 'session',
            items: [
                {
                    category: 'capability_gap',
                    toolName: 'get_record',
                    severity: 3,
                    subcategory: 'missing_parameter',
                    observation: 'Tool lacks a filter parameter for querying by date range.'
                },
                {
                    category: 'capability_gap',
                    severity: 4,
                    subcategory: 'missing_tool',
                    observation: 'No tool available for bulk export of records.'
                }
            ]
        });

        expect(result.accepted).toBe(true);
        expect(feedbackHandler).toHaveBeenCalledOnce();
        const items = feedbackHandler.mock.calls[0][0].items;
        expect(items[0].category).toBe('capability_gap');
        expect(items[0].subcategory).toBe('missing_parameter');
        expect(items[0].toolName).toBe('get_record');
        expect(items[1].category).toBe('capability_gap');
        expect(items[1].subcategory).toBe('missing_tool');
        expect(items[1].toolName).toBeUndefined();

        await client.close();
        await server.close();
    });

    test('client privacy level is communicated in capabilities', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['usability', 'reliability', 'documentation', 'efficiency', 'interoperability', 'capability_gap']
                    }
                }
            }
        );

        let receivedClientCaps: unknown;
        server.oninitialized = () => {
            receivedClientCaps = server.getClientCapabilities();
        };

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        level: 2
                    }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        expect(receivedClientCaps).toBeDefined();
        const feedbackCaps = (receivedClientCaps as { feedback: { level: number } }).feedback;
        expect(feedbackCaps.level).toBe(2);

        await client.close();
        await server.close();
    });

    test('client explicit categories override is communicated in capabilities', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'session',
                        categories: ['usability', 'reliability', 'documentation', 'efficiency', 'interoperability', 'capability_gap']
                    }
                }
            }
        );

        let receivedClientCaps: unknown;
        server.oninitialized = () => {
            receivedClientCaps = server.getClientCapabilities();
        };

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        categories: ['reliability', 'efficiency']
                    }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        expect(receivedClientCaps).toBeDefined();
        const feedbackCaps = (receivedClientCaps as { feedback: { categories: string[] } }).feedback;
        expect(feedbackCaps.categories).toEqual(['reliability', 'efficiency']);

        await client.close();
        await server.close();
    });

    test('feedback budget is communicated in client capabilities', async () => {
        const server = new Server(
            { name: 'TestServer', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        cadence: 'monthly',
                        categories: ['usability']
                    }
                }
            }
        );

        // Capture client capabilities during initialization
        let receivedClientCaps: unknown;
        server.oninitialized = () => {
            receivedClientCaps = server.getClientCapabilities();
        };

        const client = new Client(
            { name: 'TestClient', version: '1.0.0' },
            {
                capabilities: {
                    feedback: {
                        enabled: true,
                        budget: {
                            maxTokensPerMonth: 500,
                            maxSubmissionsPerMonth: 2
                        }
                    }
                }
            }
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        expect(receivedClientCaps).toBeDefined();
        expect((receivedClientCaps as { feedback: { enabled: boolean; budget: { maxTokensPerMonth: number } } }).feedback.enabled).toBe(true);
        expect((receivedClientCaps as { feedback: { budget: { maxTokensPerMonth: number } } }).feedback.budget.maxTokensPerMonth).toBe(500);
        expect((receivedClientCaps as { feedback: { budget: { maxSubmissionsPerMonth: number } } }).feedback.budget.maxSubmissionsPerMonth).toBe(2);

        await client.close();
        await server.close();
    });
});
