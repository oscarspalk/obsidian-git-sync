import { App, Modal, Setting } from "obsidian";

export class DangerModal extends Modal {
    result: string;
    onYes: () => void;
    text: string;
    constructor(app: App, onYes: () => void, text: string) {
        super(app);
        this.onYes = onYes;
        this.text = text;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: this.text });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Yes, I am sure.")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onYes();
                    }));
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}