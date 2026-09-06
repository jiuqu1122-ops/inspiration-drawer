export const reorderCanvasInputs = (
  inputs: string[],
  fromIndex: number,
  toIndex: number,
) => {
  if (
    fromIndex < 0
    || fromIndex >= inputs.length
    || toIndex < 0
    || toIndex >= inputs.length
    || fromIndex === toIndex
  ) {
    return inputs;
  }
  const next = [...inputs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export const replaceCanvasInputAt = (
  inputs: string[],
  previousInputId: string,
  nextInputId: string,
) => {
  const previousIndex = inputs.indexOf(previousInputId);
  if (previousIndex < 0 || !nextInputId) return inputs;
  if (previousInputId === nextInputId) return inputs;

  const withoutPreviousOrDuplicate = inputs.filter(inputId => (
    inputId !== previousInputId && inputId !== nextInputId
  ));
  withoutPreviousOrDuplicate.splice(
    Math.min(previousIndex, withoutPreviousOrDuplicate.length),
    0,
    nextInputId,
  );
  return withoutPreviousOrDuplicate;
};
