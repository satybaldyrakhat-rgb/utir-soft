// Рекламная атрибуция Meta: достаём fbclid (из перехода по рекламе) и
// cookie _fbp/_fbc, чтобы CRM могла связать заявку с конкретным креативом.
// Приложение на hash-роутинге, поэтому fbclid ищем и в обычном query, и
// в query-части хеша (#/lead/CODE?fbclid=...).
export function getFbTracking(): { fbclid?: string; fbp?: string; fbc?: string } {
  try {
    const searchParams = new URLSearchParams(window.location.search || '');
    const hashQuery = (window.location.hash.split('?')[1]) || '';
    const hashParams = new URLSearchParams(hashQuery);
    const fbclid = searchParams.get('fbclid') || hashParams.get('fbclid') || undefined;
    const cookie = (name: string) => {
      const hit = document.cookie.split('; ').find(c => c.startsWith(name + '='));
      return hit ? decodeURIComponent(hit.split('=')[1]) : undefined;
    };
    return { fbclid: fbclid || undefined, fbp: cookie('_fbp'), fbc: cookie('_fbc') };
  } catch {
    return {};
  }
}
