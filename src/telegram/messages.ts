type MediaMessage = {
    photo?: readonly { file_id: string }[];
    document?: { file_id: string; mime_type?: string };
};

export function imageFile(message: MediaMessage) {
    const photo = message.photo?.at(-1);
    if (photo) return { fileId: photo.file_id, mimeType: 'image/jpeg' };
    const document = message.document;
    if (document?.mime_type && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(document.mime_type)) {
        return { fileId: document.file_id, mimeType: document.mime_type };
    }
    return undefined;
}
