import type { SceneSpecV1 } from '../model/threeSceneTypes';

const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character] || character));

export const createThreeScenePreview = (sceneSpec: SceneSpecV1) => {
  const shapes = sceneSpec.objects.slice(0, 8).map((object) => {
    const x = 230 + object.position[0] * 22 + object.position[2] * 7;
    const y = 205 - object.position[1] * 27 + object.position[2] * 10;
    const width = Math.max(16, object.scale[0] * 42);
    const height = Math.max(14, object.scale[1] * 36);
    const color = escapeXml(object.material.color);
    const opacity = Math.max(0.12, object.material.opacity);
    if (object.primitive === 'sphere') {
      return `<ellipse cx="${x}" cy="${y}" rx="${width / 2}" ry="${height / 2}" fill="${color}" fill-opacity="${opacity}"/>`;
    }
    if (object.primitive === 'cylinder') {
      return `<g fill="${color}" fill-opacity="${opacity}"><rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"/><ellipse cx="${x}" cy="${y - height / 2}" rx="${width / 2}" ry="${Math.max(4, height * 0.12)}"/></g>`;
    }
    if (object.primitive === 'capsule') {
      return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="${Math.min(width, height) / 2}" fill="${color}" fill-opacity="${opacity}" transform="rotate(${object.rotation[2] * 57.3} ${x} ${y})"/>`;
    }
    if (object.primitive === 'cone') {
      return `<path d="M ${x} ${y - height / 2} L ${x + width / 2} ${y + height / 2} L ${x - width / 2} ${y + height / 2} Z" fill="${color}" fill-opacity="${opacity}" transform="rotate(${object.rotation[2] * 57.3} ${x} ${y})"/>`;
    }
    if (object.primitive === 'torus') {
      const strokeWidth = Math.max(4, Math.min(width, height) * (object.thickness ?? 0.14));
      return `<ellipse cx="${x}" cy="${y}" rx="${width / 2}" ry="${height / 2}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" transform="rotate(${object.rotation[2] * 57.3} ${x} ${y})"/>`;
    }
    if (object.primitive === 'plane') {
      return `<path d="M ${x - width / 2} ${y} l ${width * 0.7} ${-height * 0.28} l ${width * 0.3} ${height * 0.24} l ${-width * 0.7} ${height * 0.32} z" fill="${color}" fill-opacity="${opacity}"/>`;
    }
    const radius = object.primitive === 'rounded_box' ? Math.min(18, width * 0.18, height * 0.18) : 2;
    return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="${radius}" fill="${color}" fill-opacity="${opacity}" transform="rotate(${object.rotation[1] * 20} ${x} ${y})"/>`;
  }).join('');
  const background = escapeXml(sceneSpec.environment.background);
  const ground = escapeXml(sceneSpec.environment.ground.color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="340" viewBox="0 0 460 340"><rect width="460" height="340" fill="${background}"/><path d="M0 245 L460 210 L460 340 L0 340Z" fill="${ground}" fill-opacity="${sceneSpec.environment.ground.enabled ? 1 : 0}"/><ellipse cx="240" cy="238" rx="130" ry="24" fill="#000" fill-opacity=".10"/>${shapes}<g fill="none" stroke="#fff" stroke-opacity=".34"><path d="M18 24h34M18 24v34M442 24h-34M442 24v34"/></g><text x="20" y="316" fill="#fff" fill-opacity=".68" font-family="system-ui,sans-serif" font-size="11" letter-spacing="1.5">3D COMPOSITION</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
