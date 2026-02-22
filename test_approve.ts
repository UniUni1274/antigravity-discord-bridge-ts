import { AntigravityClient } from './src/antigravityClient';
import * as vscode from 'vscode';

async function test() {
    const dummyChannel = {
        appendLine: (msg: string) => console.log(msg),
        name: 'test',
        append: () => { },
        replace: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { }
    } as any;
    const client = new AntigravityClient(dummyChannel);
    await client.initialize();

    // Test HandleUserInteraction
    try {
        const payload = {
            "cascadeId": "dummy-id",
            "interaction": {
                "accept": {}
            }
        };
        const res = await (client as any).makeRequest('aida.v1.AidaService', 'HandleCascadeUserInteraction', payload);
        console.log("HandleUserInteraction:", res);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
