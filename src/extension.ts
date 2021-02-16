import * as vscode from 'vscode';

import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { tSQLtAdapter } from './tSQLt/tSQLtAdapter';

export async function activate(context: vscode.ExtensionContext) {
	const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

	const log = new Log('tSQLt test adapter', workspaceFolder, 'tSQLt test adapter log');
	context.subscriptions.push(log);

	const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
	if (!testExplorerExtension) {
		if (log.enabled) {
			log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);
		}
		return;
	}

	if (!testExplorerExtension.isActive) {
		await testExplorerExtension.activate();
	}

	const testHub = testExplorerExtension.exports;
	context.subscriptions.push(new TestAdapterRegistrar(
		testHub,
		workspaceFolder => new tSQLtAdapter(workspaceFolder, log),
		log
	));
}

// this method is called when your extension is deactivated
export function deactivate() { }
