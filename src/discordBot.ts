import * as vscode from 'vscode';
import * as fs from 'fs';
import { Client, GatewayIntentBits, Partials, Events, Message, Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } from 'discord.js';
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

            if (customId.startsWith('review_yes_')) {
                const cascadeId = customId.replace('review_yes_', '');
                await interaction.update({ content: '✅ 承認されました。実装を続行します。', components: [] });

                const items = [{ text: "<discord_reply>ユーザーが計画を承認(Yes)しました。この計画通りに実装を開始してください。</discord_reply>\n\n[システム司令: ユーザーがYesを選択しました。計画に従って実行フェーズに入ってください。]" }];

                let initialMsg = await interaction.message.reply(`🤔 Processing task... (\`${GLOBAL_STATE.currentModelDisplay}\` / \`${GLOBAL_STATE.currentMode}\`)`);

                try {
                    await this.antigravityClient.sendUserMessage(cascadeId, items, GLOBAL_STATE.currentModel);
                    this.pollStepsAndStream(cascadeId, [initialMsg]).catch(e => console.error(e));
                } catch (e: any) {
                    await initialMsg.edit(`❌ Error: ${e.message}`);
                }
                return;
            }

            if (customId.startsWith('review_no_')) {
                await interaction.update({ content: '❌ 修正を指示します。', components: [] });
                await interaction.message.reply("修正点や追加の要望をこのスレッドに返信してください（ボットが自動的に文脈を引き継ぎ、計画書を更新します）。");
                return;
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

    private threadCascadeMap = new Map<string, string>();

    private async handleUserMessage(message: Message) {
        const text = message.content;
        const dispModel = GLOBAL_STATE.currentModelDisplay;

        let finalMessage = message.content.trim();
        let systemPrompt = "\n\n[システム司令: あなたはDiscord経由でユーザーと対話しています。思考過程やツール実行の宣言はIDE上には通常通り全て出力して構いませんが、Discordユーザーへの最終報告や返答文（「〇〇が完了しました」といった綺麗なメッセージや最終のURL等）は、必ず `<discord_reply>` と `</discord_reply>` のXMLタグで囲んで出力してください。タグの外側の文章はDiscord側では非表示になるため、ユーザーへの返事はすべてこのタグ内に含めてください。]\n[システム司令: もしユーザーに実装計画書などの .md ファイルを提示して承認を得たい場合は、必ず `<discord_review file=\"絶対パス\">` の形式で出力してください。これを検知するとユーザーにYes/Noボタンが提示されます。]";

        if (GLOBAL_STATE.autoApprove) {
            const config = vscode.workspace.getConfiguration('antigravity-discord-bridge');
            const githubUsername = config.get<string>('githubUsername') || '';
            const githubToken = config.get<string>('githubToken') || '';

            let githubInstructions = "さらに最後に `gh repo create` などを用いてGitHubリポジトリを作成・Pushし、最終的にURLか結果を出力してください。";
            if (githubUsername && githubToken) {
                githubInstructions = `さらに最後に与えられたGitHubのUsername (${githubUsername}) と Token (${githubToken}) を用いて認証を行い、\`gh repo create\`などでGitHubリポジトリを作成・Pushし、最終的にURLか結果を出力してください。`;
            }

            systemPrompt += `\nまた、この依頼を処理する際、ターミナルコマンドの実行やファイル変更はすべてそのまま行い、${githubInstructions}`;
        }

        finalMessage += systemPrompt;

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
                            data: buffer.toString('base64')
                        }
                    });
                } catch (e: any) {
                    this.outputChannel.appendLine(`[Error] Failed to process image: ${e.message}`);
                }
            }
        }

        if (items.length === 0) return;

        let targetChannel = message.channel;
        let cascadeId: string | null = null;
        let initialMsg: Message;

        if (targetChannel.isThread()) {
            // Check if we have an existing cascade context
            cascadeId = this.threadCascadeMap.get(targetChannel.id) || null;
            if (!cascadeId) {
                // Thread exists but we lost tracking (e.g. restart). Create new context anyway.
                this.outputChannel.appendLine(`[Antigravity] Thread not found in map, creating new cascade context.`);
                cascadeId = await this.antigravityClient.startCascade();
                this.threadCascadeMap.set(targetChannel.id, cascadeId);
            } else {
                this.outputChannel.appendLine(`[Antigravity] Resuming context in thread: ${targetChannel.id} (Cascade: ${cascadeId})`);
            }
            initialMsg = await message.reply(`🤔 Thinking... (\`${dispModel}\` / \`${GLOBAL_STATE.currentMode}\`)`);
        } else {
            // It's a normal channel message -> Start new cascade & thread
            cascadeId = await this.antigravityClient.startCascade();

            // Create a short name for the thread based on user text
            let threadName = `Task: ${text.substring(0, 30).replace(/\n/g, ' ')}`;
            if (threadName.length < 7) threadName = "Task: Processing...";

            initialMsg = await message.reply(`🧵 Starting isolated task environment in thread...`);

            const thread = await message.startThread({
                name: threadName,
                autoArchiveDuration: 60,
                reason: 'Antigravity isolated task thread'
            });

            this.threadCascadeMap.set(thread.id, cascadeId);
            targetChannel = thread;

            // Send the first tracking message inside the new thread
            initialMsg = await thread.send(`🤔 Thinking... (\`${dispModel}\` / \`${GLOBAL_STATE.currentMode}\`)`);
            this.outputChannel.appendLine(`[Antigravity] Started cascade: ${cascadeId} in thread ${thread.id}`);
        }

        try {
            await this.antigravityClient.sendUserMessage(cascadeId, items, GLOBAL_STATE.currentModel);
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

                        // Check for discord_review tags when done
                        const reviewRegex = /<discord_review\s+file="([^"]+)">/g;
                        let match;
                        while ((match = reviewRegex.exec(responseText)) !== null) {
                            const filePath = match[1];
                            if (fs.existsSync(filePath)) {
                                const attachment = new AttachmentBuilder(filePath);

                                const btnYes = new ButtonBuilder()
                                    .setCustomId(`review_yes_${cascadeId}`)
                                    .setLabel('Yes (実装開始)')
                                    .setStyle(ButtonStyle.Success);

                                const btnNo = new ButtonBuilder()
                                    .setCustomId(`review_no_${cascadeId}`)
                                    .setLabel('No (修正を指示)')
                                    .setStyle(ButtonStyle.Danger);

                                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnYes, btnNo);

                                try {
                                    await messages[messages.length - 1].reply({
                                        content: `📄 **実装計画書・ドキュメントが作成されました。** 確認して承認（Yes）か修正（No）を選択してください。`,
                                        files: [attachment],
                                        components: [row]
                                    });
                                } catch (e) {
                                    this.outputChannel.appendLine(`[Error] Failed to send review panel: ${e}`);
                                }
                            }
                        }
                    }

                    if (responseText !== lastReportedText || isDone) {
                        lastReportedText = responseText;

                        const now = Date.now();
                        // Rate limit Discord edits (1.5s) unless done
                        if (!isDone && (now - lastEditTime) < 1500) break;
                        lastEditTime = now;

                        let fullText = responseText;

                        // Extract noiseless <discord_reply> tag
                        const openTag = '<discord_reply>';
                        const closeTag = '</discord_reply>';
                        const startIndex = fullText.indexOf(openTag);

                        if (startIndex !== -1) {
                            const contentStart = startIndex + openTag.length;
                            const endIndex = fullText.indexOf(closeTag, contentStart);
                            if (endIndex !== -1) {
                                fullText = fullText.substring(contentStart, endIndex).trim();
                            } else {
                                fullText = fullText.substring(contentStart).trim();
                            }
                        } else {
                            if (isDone && fullText.trim().length > 0) {
                                // Fallback: AI completely forgot tags, show the full text rather than hanging
                                fullText = fullText.trim();
                            } else {
                                // Still processing thoughts, tag not yet reached
                                fullText = '';
                            }
                        }

                        if (!fullText.trim()) {
                            fullText = `🤔 Processing task... (\`${GLOBAL_STATE.currentModelDisplay}\` / \`${GLOBAL_STATE.currentMode}\`)`;
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
