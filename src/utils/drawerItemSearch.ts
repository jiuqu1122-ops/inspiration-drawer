import type { BufferItem } from '../types';

const cleanTextList = (values?: string[]) => (
  Array.isArray(values) ? values.map(value => String(value || '').trim()).filter(Boolean) : []
);

const getItemRemarkEntries = (item: Pick<BufferItem, 'remark' | 'remarks'>) => {
  const fromList = cleanTextList(item.remarks);
  if (fromList.length > 0) return fromList;
  return typeof item.remark === 'string'
    ? item.remark.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    : [];
};

export const replaceFirstItemRemark = (
  item: Pick<BufferItem, 'remark' | 'remarks'>,
  firstRemark: string,
) => {
  const rest = getItemRemarkEntries(item).slice(1);
  const remarks = [firstRemark.trim(), ...rest].filter(Boolean);
  return {
    remark: remarks.join('\n'),
    remarks: remarks.length > 0 ? remarks : undefined,
  };
};

export const getDrawerItemSearchText = (item: BufferItem) => {
  const profile = item.inspirationProfile;
  const searchableRemarks = item.type === 'image'
    ? []
    : [item.remark, ...cleanTextList(item.remarks)];
  const profileText = profile ? [
    profile.summary,
    ...cleanTextList(profile.objects),
    profile.category,
    ...cleanTextList(profile.form?.silhouette),
    ...cleanTextList(profile.form?.geometry),
    ...cleanTextList(profile.form?.proportion),
    ...cleanTextList(profile.cmf?.colors),
    ...cleanTextList(profile.cmf?.materials),
    ...cleanTextList(profile.cmf?.finishes),
    ...cleanTextList(profile.style),
    ...cleanTextList(profile.interaction),
    ...cleanTextList(profile.scene),
    ...cleanTextList(profile.mood),
    ...cleanTextList(profile.userTags),
    ...cleanTextList(profile.userNotes),
    ...(profile.aiTags || []).map(tag => String(tag?.name || '').trim()).filter(Boolean),
  ] : [];

  return [
    item.name,
    item.content,
    ...searchableRemarks,
    item.path,
    item.url,
    ...profileText,
  ].filter(Boolean).join(' ').toLowerCase();
};
