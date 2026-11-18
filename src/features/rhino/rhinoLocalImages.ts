import type { RhinoCommand } from './rhinoProtocol';
import type { PendingChatAttachment } from '../chat/model/chatTypes';

export const validateRhinoLocalImages = (images: RhinoCommand['localImages']) => {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 6) throw new Error('每次最多上传 6 张本地参考图片');
  return images.map(image => {
    if (!image || typeof image.name !== 'string' || image.name.length > 255 || typeof image.dataUrl !== 'string'
      || image.dataUrl.length > 1024 * 1024 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)) {
      throw new Error('本地参考图片格式或大小无效，请重新添加图片');
    }
    return image;
  });
};
export const saveRhinoLocalImages = async (command: RhinoCommand,
  save: (args: { fileName: string; dataUrl: string }) => Promise<string>): Promise<PendingChatAttachment[]> => {
  const images = validateRhinoLocalImages(command.localImages);
  const attachments: PendingChatAttachment[] = [];
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const png = image.dataUrl.startsWith('data:image/png;');
    const id = `rhino-local-${command.id}-${index}`;
    const path = await save({ fileName: id + (png ? '.png' : '.jpg'), dataUrl: image.dataUrl });
    attachments.push({ id, type: 'image', path, thumbnailPath: path, mimeType: png ? 'image/png' : 'image/jpeg',
      metadataJson: JSON.stringify({ source: 'rhino-local', documentId: command.documentId, name: image.name, role: 'reference' }) });
  }
  return attachments;
};
