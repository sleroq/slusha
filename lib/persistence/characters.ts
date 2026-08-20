import { eq } from 'drizzle-orm';
import type { Character } from '../charhub/api.ts';
import type { DbClient } from '../db/client.ts';
import { chatCharacters } from '../db/schema.ts';
import type { BotCharacter } from './types.ts';

export class CharacterRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async get() {
        const row = await this.db.query.chatCharacters.findFirst({
            where: eq(chatCharacters.chatId, this.chatId),
        });

        if (!row) return;

        const character: BotCharacter = {
            ...JSON.parse(row.payload) as Character,
            names: JSON.parse(row.names) as string[],
        };

        return character;
    }

    async unsetCharacter() {
        await this.db.delete(chatCharacters).where(
            eq(chatCharacters.chatId, this.chatId),
        );
    }

    async setCharacter(character: BotCharacter) {
        await this.db.insert(chatCharacters).values({
            chatId: this.chatId,
            payload: JSON.stringify(character),
            names: JSON.stringify(character.names),
        }).onConflictDoUpdate({
            target: [chatCharacters.chatId],
            set: {
                payload: JSON.stringify(character),
                names: JSON.stringify(character.names),
            },
        });
    }
}
