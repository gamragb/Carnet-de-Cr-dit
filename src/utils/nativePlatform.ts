import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function shareOrSaveNativeTextFile(
  content: string,
  filename: string
): Promise<boolean> {
  if (!isNativeApp()) return false;
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const written = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  await Share.share({
    title: filename,
    files: [written.uri],
  });
  return true;
}

export async function shareOrSaveNativeBinaryBlob(
  blob: Blob,
  filename: string
): Promise<boolean> {
  if (!isNativeApp()) return false;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read error'));
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.readAsDataURL(blob);
  });

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  await Share.share({
    title: filename,
    files: [written.uri],
  });
  return true;
}

interface AndroidPrintWindow extends Window {
  AndroidPrintBridge?: {
    printPage?: () => void;
  };
}

export function triggerNativePrint(): void {
  if (typeof window === 'undefined') return;
  const bridge = (window as AndroidPrintWindow).AndroidPrintBridge;
  if (bridge && typeof bridge.printPage === 'function') {
    bridge.printPage();
    return;
  }
  window.print();
}
