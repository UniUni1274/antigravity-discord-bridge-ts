# Antigravity Chat Bridge (Native)

Control your Antigravity IDE and run the built-in AI assistant remotely via Chat.

## Features
- **Zero Python Dependency**: Entirely written in TypeScript, connects natively via gRPC/HTTP2.
- **Auto-Start**: The bot automatically starts when you open the IDE.
- **Model Selection UI**: Choose between different models directly from Chat.
- **Real-time Streaming**: Watch the AI thinking process stream directly to your Chat channel.

## 🚀 Setup Guide
1. Create an APP at the generic Developer Portal.
2. Grab your Application **API Key**.
3. Enable all required **Intents** (Presence, Members, Message).
4. Invite the proxy to your server using the OAuth2 URL generator.
5. In your IDE, go to Settings (`Ctrl+,`) and search for `Antigravity Chat Bridge`.
6. Paste your API Key and your personal numeric **Admin ID** (for security).
7. The proxy will automatically start! (Or you can toggle it via the Status Bar button).

---

## 🤝 Contributing

We welcome contributions from the community! If you are an advanced developer who wants to improve the Antigravity Chat Bridge:

1. Fork the repository on GitHub.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

Bug reports and feature requests are also highly appreciated via GitHub Issues!
