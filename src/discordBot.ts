import * as vscode from 'vscode';
import { Client, GatewayIntentBits, Partials, Events, Message, Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { AntigravityClient } from './antigravityClient';

const MODEL_MAP: Record<string, string> = {
    'Gemini 3.1 Pro (High)': 'MODEL_PLACEHOLDER_M37',
    'Gemini 3.1 Pro (Low)': 'MODEL_PLACEHOLDER_M36',
    'Gemini 3 Pro (High)': 'MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING',
    'Gemini 3 Pro (Low)': 'MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE',
    'Gemini 3 Flash': 'MODEL_PLACEHOLDER_M18',
    'Claude Sonnet 4.6 (Thinking)': 'MODEL_PLACEHOLDER_M35',
    'Claude Opus 4.6 (Thinking)': 'MODEL_PLACEHOLDER_M26',
    'GPT-OSS 120B (Medium)': 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM'
};

const GLOBAL_STATE = {
    currentModel: 'MODEL_PLACEHOLDER_M37', // Default to Gemini 3.1 Pro
    currentModelDisplay: 'Gemini 3.1 Pro (High)',
    currentMode: 'Planning',
    autoApprove: false
};

export class DiscordBot {
    private client: Client;
    private isRunning: boolean = false;

    constructor(
        private token: string,
        private allowedUserId: string,
        private antigravityClient: AntigravityClient,
        private outputChannel: vscode.OutputChannel
    ) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel]
        });

        this.registerEvents();
    }

    private registerEvents() {
        this.client.on(Events.ClientReady, () => {
            this.outputChannel.appendLine(`[Discord] Bot is online as ${this.client.user?.tag}`);
            this.client.user?.setActivity('Antigravity IDE', { type: 0 });
        });

        this.client.on(Events.MessageCreate, async (message: Message) => {
            // Ignore bots and unauthorized users
            if (message.author.bot) return;
            if (this.allowedUserId && message.author.id !== this.allowedUserId) {
                this.outputChannel.appendLine(`[Discord] Blocked unauthorized request from ${message.author.tag}`);
                return;
            }

            // Command parsing
            if (message.content.startsWith('/models') || message.content === '!models') {
                await this.sendModelSelectionPanel(message);
                return;
            }
            if (message.content.startsWith('/mode ')) {
                const modeArgs = message.content.split(' ')[1]?.toLowerCase();
                if (modeArgs === 'planning') {
                    GLOBAL_STATE.currentMode = 'Planning';
                    GLOBAL_STATE.currentModel = MODEL_MAP['Gemini 3.1 Pro (High)'];
                    GLOBAL_STATE.currentModelDisplay = 'Gemini 3.1 Pro (High)';
                    await message.reply('🧠 Switched to **Planning Mode** (High Intelligence: Gemini 3.1 Pro).');
                } else if (modeArgs === 'fast') {
                    GLOBAL_STATE.currentMode = 'Fast';
                    GLOBAL_STATE.currentModel = MODEL_MAP['Gemini 3 Flash'];
                    GLOBAL_STATE.currentModelDisplay = 'Gemini 3 Flash';
                    await message.reply('⚡ Switched to **Fast Mode** (High Speed: Gemini 3 Flash).');
                } else if (modeArgs === 'auto') {
                    GLOBAL_STATE.autoApprove = !GLOBAL_STATE.autoApprove;
                    const status = GLOBAL_STATE.autoApprove ? 'ON' : 'OFF';
                    await message.reply(`🤖 **Auto-Approve / GitHub Deployment Mode** is now **${status}**.\n*(When ON, the AI will be instructed to automatically run commands, create a GitHub repo, and push the final code.)*`);
                } else {
                    await message.reply('Invalid mode. Use `/mode planning`, `/mode fast`, or `/mode auto`.');
                }
                return;
            }

            // Direct Chat routing
            if (message.content.trim()) {
                await this.handleUserMessage(message);
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            if (!interaction.isButton()) return;

            if (this.allowedUserId && interaction.user.id !== this.allowedUserId) {
                await interaction.reply({ content: 'You are not authorized to use this.', ephemeral: true });
                return;
            }

            const customId = interaction.customId;
            if (!customId.startsWith('model_')) return;

            const newModelId = customId.replace('model_', '');

            // Find display name
            let displayName = 'Unknown Model';
            for (const [key, val] of Object.entries(MODEL_MAP)) {
                if (val === newModelId) {
                    displayName = key;
                    break;
                }
            }

            if (newModelId) {
                GLOBAL_STATE.currentModel = newModelId;
                GLOBAL_STATE.currentModelDisplay = displayName;

                // Update original message
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Model Selected')
                    .setColor('#5865F2')
                    .addFields({ name: 'Current Model', value: `**${GLOBAL_STATE.currentModelDisplay}**` })
                    .setFooter({ text: `Mode: ${GLOBAL_STATE.currentMode}` });

                // Remove buttons
                await interaction.update({ embeds: [embed], components: [] });
                this.outputChannel.appendLine(`[Discord] Model switched to: ${displayName}`);
            }
        });
    }

    private async sendModelSelectionPanel(message: Message) {
        const embed = new EmbedBuilder()
            .setTitle('🧠 Model Configuration')
            .setDescription('Select the AI model for the Antigravity Bridge:')
            .setColor('#2ecc71');

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let currentRow = new ActionRowBuilder<ButtonBuilder>();

        for (const [displayName, id] of Object.entries(MODEL_MAP)) {
            const btn = new ButtonBuilder()
                .setCustomId(`model_${id}`)
                .setLabel(displayName)
                .setStyle(GLOBAL_STATE.currentModel === id ? ButtonStyle.Success : ButtonStyle.Secondary);

            currentRow.addComponents(btn);
            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder<ButtonBuilder>();
            }
        }
        if (currentRow.components.length > 0) {
            rows.push(currentRow);
        }

        await message.reply({ embeds: [embed], components: rows });
    }

    private async handleUserMessage(message: Message) {
        const text = message.content;
        const dispModel = GLOBAL_STATE.currentModelDisplay;

        let finalMessage = message.content.trim();
        if (GLOBAL_STATE.autoApprove) {
            const config = vscode.workspace.getConfiguration('antigravity-discord-bridge');
            const githubUsername = config.get<string>('githubUsername') || '';
            const githubToken = config.get<string>('githubToken') || '';

            let githubInstructions = "最後に `gh repo create` などを用いてGitHubリポジトリを作成・Pushし、最終的にURLか結果を出力してください。";
            if (githubUsername && githubToken) {
                githubInstructions = `最後に与えられたGitHubのUsername (${githubUsername}) と Token (${githubToken}) を用いて認証を行い、\`gh repo create\`などでGitHubリポジトリを作成・Pushし、最終的にURLか結果を出力してください。`;
            }

            finalMessage += `\n\n[システム司令: この依頼を処理する際、ターミナルコマンドの実行やファイル変更はすべてそのまま行い、${githubInstructions}]`;
        }

        const items: any[] = [];
        if (finalMessage) {
            items.push({ text: finalMessage });
        }

        for (const [id, attachment] of message.attachments) {
            if (attachment.contentType?.startsWith('image/')) {
                try {
                    const response = await fetch(attachment.url);
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    items.push({
                        image: {
                            data: buffer.toString('base64') // Or whatever specific structure the API needs. Base64 is standard.
                        }
                    });
                } catch (e: any) {
                    this.outputChannel.appendLine(`[Error] Failed to process image: ${e.message}`);
                }
            }
        }

        if (items.length === 0) return;

        let initialMsg = await message.reply(`🤔 Thinking... (\`${dispModel}\` / \`${GLOBAL_STATE.currentMode}\`)`);

        try {
            const cascadeId = await this.antigravityClient.startCascade();
            await this.antigravityClient.sendUserMessage(cascadeId, items, GLOBAL_STATE.currentModel);

            this.outputChannel.appendLine(`[Antigravity] Started cascade: ${cascadeId}`);

            await this.pollStepsAndStream(cascadeId, [initialMsg]);

        } catch (e: any) {
            this.outputChannel.appendLine(`[Error] Cascade failed: ${e.message}`);
            await initialMsg.edit(`❌ Error communicating with IDE: ${e.message}`);
        }
    }

    private async pollStepsAndStream(cascadeId: string, messages: Message[]) {
        let isDone = false;
        let lastReportedText = '';
        let lastEditTime = Date.now();
        let indicator = ' 🔵';

        while (!isDone) {
            const steps = await this.antigravityClient.getCascadeSteps(cascadeId);

            for (const step of steps) {
                if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
                    const status = step.status;
                    const responseText = step.plannerResponse?.response || '';

                    if (status === 'CORTEX_STEP_STATUS_DONE') {
                        isDone = true;
                    }

                    if (responseText !== lastReportedText || isDone) {
                        lastReportedText = responseText;

                        const now = Date.now();
                        // Rate limit Discord edits (1.5s) unless done
                        if (!isDone && (now - lastEditTime) < 1500) break;
                        lastEditTime = now;

                        let fullText = responseText;
                        if (!fullText.trim()) {
                            fullText = `🤔 Thinking... (\`${GLOBAL_STATE.currentModelDisplay}\` / \`${GLOBAL_STATE.currentMode}\`)`;
                        }

                        // Split into 1900 char chunks to respect Discord limits
                        const chunkSize = 1900;
                        const chunks = [];
                        for (let i = 0; i < fullText.length; i += chunkSize) {
                            chunks.push(fullText.substring(i, i + chunkSize));
                        }
                        if (chunks.length === 0) chunks.push(fullText);

                        while (messages.length < chunks.length) {
                            const newMsg = await messages[messages.length - 1].reply("...");
                            messages.push(newMsg);
                        }

                        for (let i = 0; i < chunks.length; i++) {
                            let disp = chunks[i];
                            if (i === chunks.length - 1 && !isDone) {
                                indicator = indicator === ' 🔵' ? ' 🟢' : ' 🔵';
                                disp += indicator;
                            }
                            try {
                                await messages[i].edit(disp);
                            } catch (e) { /* ignore rate limits */ }
                        }
                    }
                }
            }

            if (GLOBAL_STATE.autoApprove && !isDone) {
                // Automatically send 'accept' interactions to bypass any user confirmations required by the IDE (e.g. running commands)
                this.antigravityClient.approveWait(cascadeId).catch(() => { });
            }

            if (!isDone) {
                await new Promise(resolve => setTimeout(resolve, 800)); // poll interval
            }
        }
        this.outputChannel.appendLine(`[Antigravity] Cascade ${cascadeId} complete`);
    }

    public async start() {
        if (this.isRunning) return;
        try {
            await this.client.login(this.token);
            this.isRunning = true;
        } catch (e: any) {
            throw new Error(`Discord authentication failed. Check your token. Details: ${e.message}`);
        }
    }

    public async stop() {
        if (!this.isRunning) return;
        this.client.destroy();
        this.isRunning = false;
        this.outputChannel.appendLine(`[Discord] Bot offline`);
    }
}
