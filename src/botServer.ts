import * as vscode from 'vscode';
import { DiscordBot } from './discordBot';
import { AntigravityClient } from './antigravityClient';

export class BotServer {
    public isRunning: boolean = false;
    private discordBot: DiscordBot | null = null;
    private antigravityClient: AntigravityClient | null = null;

    constructor(
        private outputChannel: vscode.OutputChannel,
        private statusBarItem: vscode.StatusBarItem
    ) { }

    public async start(): Promise<void> {
        if (this.isRunning) return;

        const config = vscode.workspace.getConfiguration('antigravity-discord-bridge');
        const token = config.get<string>('botToken');
        const allowedUserId = config.get<string>('allowedUserId');

        if (!token) {
            vscode.window.showErrorMessage('Antigravity Discord Bridge: "Bot Token" is missing in settings.');
            return;
        }

        if (!allowedUserId) {
            vscode.window.showWarningMessage('Antigravity Discord Bridge: "Allowed User ID" is empty. Anyone could control your IDE!');
        }

        this.outputChannel.appendLine('[INFO] Initializing Antigravity Client...');
        try {
            this.antigravityClient = new AntigravityClient(this.outputChannel);
            await this.antigravityClient.initialize();

            this.outputChannel.appendLine('[INFO] Initializing Discord Bot...');
            this.discordBot = new DiscordBot(token, allowedUserId || '', this.antigravityClient, this.outputChannel);
            await this.discordBot.start();

            this.isRunning = true;
            this.updateUI(true);
            vscode.window.showInformationMessage('Discord Bridge Started Successfully!');
        } catch (error: any) {
            this.outputChannel.appendLine(`[ERROR] Failed to start bot server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start Discord Bridge. See logs for details.`);
            await this.stop();
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) return;
        this.outputChannel.appendLine('[INFO] Stopping Discord Bridge...');

        if (this.discordBot) {
            await this.discordBot.stop();
            this.discordBot = null;
        }

        this.antigravityClient = null;
        this.isRunning = false;

        this.updateUI(false);
        vscode.window.showInformationMessage('Discord Bridge Stopped.');
    }

    private updateUI(isRunning: boolean) {
        if (isRunning) {
            this.statusBarItem.text = `$(stop-circle) Discord Bridge (Running)`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = `$(play) Start Discord Bridge`;
            this.statusBarItem.backgroundColor = undefined;
        }
    }
}
