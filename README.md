# Antigravity Discord Bridge (Native)

Control your Antigravity IDE and run the built-in AI assistant remotely via Discord.

## Features
- **Zero Python Dependency**: Entirely written in TypeScript, connects natively via gRPC/HTTP2.
- **Auto-Start**: The bot automatically starts when you open the IDE.
- **Model Selection UI**: Choose between different models directly from Discord.
- **Real-time Streaming**: Watch the AI thinking process stream directly to your Discord channel.

## 🚀 Setup Guide
1. Create a Discord Bot at the [Developer Portal](https://discord.com/developers/applications).
2. Grab your **Bot Token**.
3. Enable all **Privileged Gateway Intents** (Presence, Server Members, Message Content).
4. Invite the bot to your server using the OAuth2 URL generator (needs `bot`, `applications.commands`, and `Administrator` permissions).
5. In your IDE, go to Settings (`Ctrl+,`) and search for `Antigravity Discord Bridge`.
6. Paste your Bot Token and your personal numeric **Discord User ID** (for security).
7. The bot will automatically start! (Or you can toggle it via the Status Bar button).

---

## ☕ Support the Developer

If you find this extension useful and it saves you time, please consider buying me a coffee! A small **$2 USDC** donation helps keep this project alive and updated.

**Solana (SOL / USDC-SPL):**
```text
E4grjx9DxwH7Ft1JYZcCA1QYqB754HVSDLuie44ag5Wh
```

**EVM (Ethereum / Polygon / Arbitrum / Base USDC):**
```text
0xBEe137Ce1412821cf8a6f6878BE6149D4cc97787
```

Thank you for your support! 💖

---

## 🤝 Contributing

We welcome contributions from the community! If you are an advanced developer who wants to improve the Antigravity Discord Bridge:

1. Fork the repository on GitHub.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

Bug reports and feature requests are also highly appreciated via GitHub Issues!
