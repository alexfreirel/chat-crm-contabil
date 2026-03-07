import toast from 'react-hot-toast';

export const showError = (msg: string) =>
  toast.error(msg, { duration: 5000 });

export const showSuccess = (msg: string) =>
  toast.success(msg, { duration: 3000 });
