// Utility for triggering actual mobile / desktop native notifications via Service Worker or Web Standard Notification API.

export const showSystemNotification = async (title: string, options: any = {}) => {
  const defaultOptions: any = {
    icon: "/pwa_icon_192.png",
    badge: "/pwa_icon_192.png",
    vibrate: [200, 100, 200],
    tag: "damdam-reminder",
    renotify: true,
    ...options
  };

  let notificationShown = false;

  try {
    // 1. Try modern Service Worker registration first if available
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const swContainer = navigator.serviceWorker;
      // Immediately check if we have any active service worker registrations
      const activeRegs = await swContainer.getRegistrations();
      const activeReg = activeRegs.find(reg => reg.active);
      
      if (activeReg && "showNotification" in activeReg) {
        await activeReg.showNotification(title, defaultOptions);
        notificationShown = true;
      } else {
        // If none is immediately active, try ready promise with a fast 150ms timeout
        const registration = await Promise.race([
          swContainer.ready,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("SW Ready Timeout")), 150))
        ]) as ServiceWorkerRegistration | null;
        
        if (registration && "showNotification" in registration) {
          await registration.showNotification(title, defaultOptions);
          notificationShown = true;
        }
      }
    }
  } catch (error) {
    console.warn("Service worker notification pathway failed or timed out:", error);
  }

  // 2. Fallback to active tab standard Notification (synchronous & instant on active screens)
  if (!notificationShown) {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, defaultOptions);
        notificationShown = true;
      }
    } catch (fallbackErr) {
      console.error("Standard Notification fallback failed:", fallbackErr);
    }
  }

  return notificationShown;
};

export const getNotificationPermission = (): string => {
  try {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
  } catch (e) {
    console.warn("Notification API is restricted or not accessible in this context:", e);
  }
  return "unsupported";
};
