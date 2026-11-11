import type { Message } from 'grammy/types';

const ignore = [
    /^ор+/i,
    /^ору+/i,
    /(ха)+/i,
    /а(пх)+/i,
    /сука+/i,
    /^сук+/i,
    /ло+л/i,
    /еба+ть/i,
    /бля+ть/i,
    /^(не)?пон+/i,
    /хорошо/i,
    /^гуд\b/i,
    /норм.*/i,
    /^ok$/i,
    /кек/i,
    /ок/i,
    /^лан$/i,
    /ладно/i,
    /спс/i,
    /^да$/i,
    /согласен$/i,
    /согласна$/i,
    /^баз/i,
    /реально$/i,
    /\/q.*/i,
];
type ReplySettings = {
    names: string[];
    tendToReply: string[];
    randomReplyProbability: number;
    tendToReplyProbability: number;
    tendToIgnoreProbability: number;
};

export function shouldReply(
    message: Message,
    bot: { id: number; username: string },
    settings: ReplySettings,
    random = Math.random,
) {
    if (message.chat.type === 'private') return true;
    const text = message.text ?? message.caption ?? '';
    const ignored = text.length < 20 && ignore.some((pattern) => pattern.test(text));
    const direct = message.reply_to_message?.from?.id === bot.id;
    if (direct && ignored && random() * 100 < settings.tendToIgnoreProbability) return false;
    if (direct) return true;

    const lower = text.toLowerCase();
    const mentioned =
        lower.includes(`@${bot.username.toLowerCase()}`) ||
        settings.names.some((name) => {
            const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, 'u').test(
                lower,
            );
        });
    const forwardedBot =
        message.forward_origin?.type === 'user' && message.forward_origin.sender_user.id === bot.id;
    if (mentioned && !forwardedBot) return true;
    if (ignored && random() * 100 < settings.tendToIgnoreProbability) return false;
    if (
        settings.tendToReply.some((phrase) => lower.includes(phrase.toLowerCase())) &&
        random() * 100 < settings.tendToReplyProbability
    )
        return true;
    return random() * 100 < settings.randomReplyProbability;
}
