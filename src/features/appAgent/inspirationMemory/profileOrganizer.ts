import type { BufferItem, Folder } from '../../../types';

export type ProfileOrganizationStrategy = 'topic' | 'topic_color';

export type ProfileOrganizationAssignment = {
  itemId: string;
  destinationName: string;
  destinationFolderId?: string;
  confidence: number;
  reason: string;
};

export type ProfileOrganizationGroup = {
  name: string;
  count: number;
  confidence: number;
  reason: string;
  samples: string[];
};

export type ProfileOrganizationPlan = {
  sourceFolderId?: string;
  recursive: boolean;
  strategy: ProfileOrganizationStrategy;
  totalImages: number;
  analyzedImages: number;
  unanalyzedImages: number;
  assignments: ProfileOrganizationAssignment[];
  groups: ProfileOrganizationGroup[];
  unresolvedItemIds: string[];
};

const cleanLabel = (value: unknown) => String(value || '')
  .replace(/[\\/:*?"<>|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 28);

const normalizeMatchText = (value: unknown) => cleanLabel(value)
  .toLocaleLowerCase()
  .replace(/[\s\-_/·、，,。.（）()[\]【】]+/g, '');

const getDescendantFolderIds = (folders: Folder[], rootId: string) => {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach(folder => {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        changed = true;
      }
    });
  }
  return result;
};

const colorFamily = (colors: string[]) => {
  const text = colors.join(' ');
  if (/米|棕|咖|橙|黄|金|暖|beige|brown|orange|yellow|gold|warm/i.test(text)) return '暖色';
  if (/蓝|青|绿|紫|冷|blue|cyan|green|purple|cool/i.test(text)) return '冷色';
  if (/红|粉|玫|red|pink|rose/i.test(text)) return '红粉色';
  if (/黑|白|灰|银|black|white|gray|grey|silver/i.test(text)) return '黑白灰';
  return '';
};

const findExistingDestination = (
  profileText: string,
  destinationFolders: Folder[],
) => {
  let best: Folder | undefined;
  let bestLength = 0;
  destinationFolders.forEach(folder => {
    const normalizedName = normalizeMatchText(folder.name);
    if (normalizedName.length < 2 || !profileText.includes(normalizedName)) return;
    if (normalizedName.length > bestLength) {
      best = folder;
      bestLength = normalizedName.length;
    }
  });
  return best;
};

export const buildProfileOrganizationPlan = (input: {
  items: BufferItem[];
  folders: Folder[];
  sourceFolderId?: string;
  recursive?: boolean;
  strategy?: ProfileOrganizationStrategy;
  categories?: string[];
}): ProfileOrganizationPlan => {
  const recursive = input.recursive !== false;
  const strategy = input.strategy || 'topic';
  const sourceFolderId = input.sourceFolderId || undefined;
  const scopeFolderIds = sourceFolderId && recursive
    ? getDescendantFolderIds(input.folders, sourceFolderId)
    : new Set(sourceFolderId ? [sourceFolderId] : []);
  const images = input.items.filter(item => (
    item.type === 'image'
    && (!sourceFolderId || (!!item.folderId && scopeFolderIds.has(item.folderId)))
  ));
  const destinationFolders = sourceFolderId
    ? input.folders.filter(folder => folder.parentId === sourceFolderId)
    : input.folders.filter(folder => !folder.parentId);
  const requestedCategories = (input.categories || []).map(cleanLabel).filter(Boolean);
  const assignments: ProfileOrganizationAssignment[] = [];
  const unresolvedItemIds: string[] = [];

  images.forEach(item => {
    const profile = item.inspirationProfile;
    if (!profile) {
      unresolvedItemIds.push(item.id);
      return;
    }
    const profileText = normalizeMatchText([
      profile.summary,
      ...profile.objects,
      profile.category,
      ...profile.style,
      ...profile.cmf.colors,
      ...profile.cmf.materials,
      ...profile.cmf.finishes,
      ...profile.scene,
      ...(profile.aiTags || []).map(tag => tag.name),
      ...profile.userTags,
      ...profile.userNotes,
    ].join(' '));
    const requestedCategory = requestedCategories
      .sort((a, b) => b.length - a.length)
      .find(category => profileText.includes(normalizeMatchText(category)));
    const existingDestination = findExistingDestination(profileText, destinationFolders);
    const objectLabel = cleanLabel(profile.objects.find(Boolean));
    const categoryLabel = cleanLabel(profile.category);
    const topicLabel = requestedCategory || existingDestination?.name || objectLabel || categoryLabel;
    if (!topicLabel) {
      unresolvedItemIds.push(item.id);
      return;
    }
    const color = strategy === 'topic_color' ? colorFamily(profile.cmf.colors) : '';
    const destinationName = cleanLabel(color ? `${topicLabel}-${color}` : topicLabel);
    const confidence = requestedCategory || existingDestination
      ? 0.96
      : objectLabel
        ? 0.86
        : 0.74;
    assignments.push({
      itemId: item.id,
      destinationName,
      destinationFolderId: color ? undefined : existingDestination?.id,
      confidence,
      reason: requestedCategory
        ? `匹配指定分类“${requestedCategory}”`
        : existingDestination
          ? `匹配现有目录“${existingDestination.name}”`
          : objectLabel
            ? `识别对象“${objectLabel}”`
            : `识别类别“${categoryLabel}”`,
    });
  });

  const grouped = new Map<string, ProfileOrganizationGroup>();
  assignments.forEach(assignment => {
    const current = grouped.get(assignment.destinationName);
    const item = images.find(candidate => candidate.id === assignment.itemId);
    if (current) {
      current.count += 1;
      current.confidence = Math.min(current.confidence, assignment.confidence);
      if (current.samples.length < 3 && item?.inspirationProfile?.summary) {
        current.samples.push(item.inspirationProfile.summary);
      }
      return;
    }
    grouped.set(assignment.destinationName, {
      name: assignment.destinationName,
      count: 1,
      confidence: assignment.confidence,
      reason: assignment.reason,
      samples: item?.inspirationProfile?.summary ? [item.inspirationProfile.summary] : [],
    });
  });

  return {
    sourceFolderId,
    recursive,
    strategy,
    totalImages: images.length,
    analyzedImages: images.length - unresolvedItemIds.length,
    unanalyzedImages: unresolvedItemIds.length,
    assignments,
    groups: [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unresolvedItemIds,
  };
};
