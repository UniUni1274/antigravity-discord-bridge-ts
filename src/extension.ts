import * as vscode from 'vscode';
import { BotServer } from './botServer';

let botServer: BotServer;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Chat Bridge (Native) is now active!');

    // Create an output channel for logs
    const outputChannel = vscode.window.createOutputChannel('Chat Bridge');
    context.subscriptions.push(outputChannel);

    // Create the status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity-chat-bridge.toggleBot';
    statusBarItem.text = '$(play) Start Chat Bridge';
    statusBarItem.tooltip = 'Click to start or stop the native Chat Bridge proxy';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Initialize the native bot server
    botServer = new BotServer(outputChannel, statusBarItem);

    // Register toggle command
    const toggleCommand = vscode.commands.registerCommand('antigravity-chat-bridge.toggleBot', async () => {
        if (botServer.isRunning) {
            await botServer.stop();
        } else {
            await botServer.start();
        }
    });
    context.subscriptions.push(toggleCommand);

    // Handle auto-start setting
    const config = vscode.workspace.getConfiguration('antigravity-chat-bridge');
    if (config.get<boolean>('autoStart', true)) {
        outputChannel.appendLine('[INFO] Auto-start is enabled. Attempting to start the bot...');
        // We do not block the activation process
        botServer.start().catch(err => {
            outputChannel.appendLine(`[ERROR] Auto-start failed: ${err}`);
        });
    }
}

export function deactivate() {
    if (botServer) {
        botServer.stop();
    }
}
