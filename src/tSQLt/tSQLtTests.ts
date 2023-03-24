import * as vscode from 'vscode';
var cliTable = require('cli-table');

//test-explorer
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';

//third-party
import { ConnectionConfig } from 'tedious';
import { parseString } from 'xml2js';

//internal
import { tSQLtResult, tSQLtTestClass, tSQLtTests } from './tSQLtTypes';
import { executeSql } from '../utils/sqlUtil';

// eslint-disable-next-line @typescript-eslint/naming-convention
export class tSQLtTestRunner {
    private tSQLtTestSuite: TestSuiteInfo = {
        type: 'suite',
        id: 'root',
        label: 'tSQLt tests',
        children: []
    };

    public constructor(
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>,
        private readonly log: Log,
    ) {
        this.log.info('Initializing tSQLt test runner');
    }

    private getConnectionInformation(): ConnectionConfig {
        const connectionInformation = JSON.parse(
            JSON.stringify(vscode.workspace.getConfiguration("tSQLtExplorer").get("tedious")));

        if (connectionInformation.options) {
            connectionInformation.options.appName = "tSQLt Test Adapter";
            connectionInformation.options.camelCaseColumns = true;
            connectionInformation.options.useColumnNames = false;
        }

        return connectionInformation;
    }

    private formatMessage(
        nodeId: string,
        state: 'running' | 'passed' | 'completed' | 'failed' | 'errored',
        timeInSeconds? : string,
        message?: string): string | undefined {

        if (state === 'running') {
            return undefined;
        }

        const timeInMilliseconds = timeInSeconds ? parseFloat(timeInSeconds) * 1000 : '';

        const testHeaderTable = new cliTable({head: ['Test Execution Summary']});

        const testCaseResultsTable = new cliTable({ head: ['Test Case Name', 'Dur (ms)', 'State']});

        const testCase = `${nodeId}`;
        const testState = `${state.toUpperCase()}`;
        testCaseResultsTable.push([testCase, timeInMilliseconds.toString(), testState]);

        var output = `${testHeaderTable.toString()}\n${testCaseResultsTable.toString()}`;

        const testMessage = `Message:\n    ${message}`;
        if (message) {output += `\n${testMessage}`;};

        return output;
    }

    private fireTestEvent(
        nodeId: string,
        state: 'running' | 'passed' | 'completed' | 'failed' | 'errored',
        timeInSeconds?: string,
        message?: string
    ): void {
        this.testStatesEmitter.fire(
            <TestEvent>{ type: 'test', test: nodeId, state: state, message: this.formatMessage(nodeId, state, timeInSeconds, message) });
    }

    private handleTestResult(result: tSQLtResult, nodeId: string): void {
        if (!result) {
            this.fireTestEvent(nodeId, 'errored');
        }

        parseString(
            result['value'],
            { explicitArray: false, explicitRoot: false, mergeAttrs: true },
            (err, result) => {
                if (result?.testsuite.failures > 0) {
                    this.fireTestEvent(nodeId, 'failed', result.testsuite.testcase.time, result.testsuite.testcase.failure.message);
                } else if (result?.testsuite.errors > 0) {
                    this.fireTestEvent(nodeId, 'errored', result.testsuite.testcase.time, result.testsuite.testcase.error.message);
                }
                else {
                    this.fireTestEvent(nodeId, 'passed', result.testsuite.testcase.time);
                }
            });
    }

    private findNode(searchNode: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
        if (searchNode.id === id) {
            return searchNode;
        } else if (searchNode.type === 'suite') {
            for (const child of searchNode.children) {
                const found = this.findNode(child, id);
                if (found) { return found; }
            }
        }
        return undefined;
    }

    private async runNode(
        node: TestSuiteInfo | TestInfo,
    ): Promise<void> {
        var query = `
        EXEC [tSQLt].[Run] '${node.id}', 'tSQLt.XmlResultFormatter';
        `;

        if (node.type === 'suite') {
            this.fireTestEvent(node.id, 'running');

            for (const child of node.children) {
                await this.runNode(child);
            }

            this.fireTestEvent(node.id, 'completed');
        } else { // node.type === 'test'

            this.fireTestEvent(node.id, 'running');

            await executeSql<tSQLtResult>(query, this.getConnectionInformation())
                .then(response => {
                    const testsuitesIndex = response.findIndex(r => r.value.includes('<testsuites>'));
                    this.handleTestResult(response[testsuitesIndex], node.id);
                })
                .catch(error => {
                    this.fireTestEvent(node.id, 'errored', undefined, error);
                });
        }
    }

    private async getTestCasesForTestClass(schemaId: number): Promise<TestInfo[]> {
        var testInfos: TestInfo[] = [];
        var query = `
        SELECT
            [SchemaId],
            [TestClassName],
            [ObjectId],
            [Name]
        FROM [tSQLt].[Tests]
        WHERE [SchemaId] = ${schemaId};
        `;

        await executeSql<tSQLtTests>(query, this.getConnectionInformation())
            .then(rows => {
                for (let row of rows) {
                    testInfos.push({
                        type: 'test',
                        id: `[${row.testClassName}].[${row.name}]`,
                        label: row.name
                    });
                }
            })
            .catch(error => {
                vscode.window.showErrorMessage(`tSQLt Test Adapter error: ${error.message}`);
            });

        return testInfos;
    }

    private async getTestClasses(): Promise<TestSuiteInfo[]> {
        var testSuites: TestSuiteInfo[] = [];
        var query = `
        SELECT
            [Name],
            [SchemaId]
        FROM [tSQLt].[TestClasses];
        `;

        await executeSql<tSQLtTestClass>(query, this.getConnectionInformation())
            .then(async rows => {
                for (let row of rows) {
                    const tests = await this.getTestCasesForTestClass(row.schemaId);
                    testSuites.push({
                        type: 'suite',
                        id: `[${row.name}]`,
                        label: row.name,
                        children: tests
                    });
                }
            })
            .catch(error => {
                vscode.window.showErrorMessage(`tSQLt Test Adapter error: ${error.message}`);
            });

        return testSuites;
    }

    public async loadtSQLtTests(): Promise<TestSuiteInfo | undefined> {
        this.tSQLtTestSuite.children = await this.getTestClasses();
        return this.tSQLtTestSuite;
    }

    public async runtSQLtTests(tests: string[]): Promise<void> {
        for (const suiteOrTestId of tests) {
            const node = this.findNode(this.tSQLtTestSuite, suiteOrTestId);
            if (node) {
                await this.runNode(node);
            }
        }
    }
}