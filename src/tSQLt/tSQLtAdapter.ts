import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { tSQLtTestRunner } from './tSQLtTests';

// eslint-disable-next-line @typescript-eslint/naming-convention
export class tSQLtAdapter implements TestAdapter {
    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
    private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
    private readonly autorunEmitter = new vscode.EventEmitter<void>();
    private readonly tSqltTestRunner: tSQLtTestRunner;

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
    get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
    get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

    constructor(
        public readonly workspace: vscode.WorkspaceFolder,
        private readonly log: Log,
    ) {

        this.log.info('Initializing tSQLt test adapter');

        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.autorunEmitter);
        this.tSqltTestRunner = new tSQLtTestRunner(workspace, this.testStatesEmitter, log);
    }

    async load(): Promise<void> {
        this.log.info('Loading tSQLt tests');
        this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

        const loadedTests = await this.tSqltTestRunner.loadtSQLtTests();

        this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
    }

    async run(tests: string[]): Promise<void> {
        this.log.info(`Running tSQLt tests ${JSON.stringify(tests)}`);
        this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });

        await this.tSqltTestRunner.runtSQLtTests(tests);

        this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
    }

    cancel(): void {
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        this.cancel();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}