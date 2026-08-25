export type ConfirmDialogAction = {
  label: string;
  onClick: () => void | Promise<void>;
  className?: string;
  title?: string;
};

export type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  actions?: ConfirmDialogAction[];
};

export type TextInputDialogIcon = 'canvas' | 'rename' | 'copy' | 'snapshot';

export type TextInputDialogState = {
  isOpen: boolean;
  title: string;
  description?: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  icon: TextInputDialogIcon;
  autoSelect: boolean;
};

export type TextInputDialogOptions = {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  icon?: TextInputDialogIcon;
  autoSelect?: boolean;
};
