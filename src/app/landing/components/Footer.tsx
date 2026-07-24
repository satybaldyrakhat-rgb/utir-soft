import { Instagram, Youtube, Send } from "lucide-react";
import logoImg from "../imports/utirrsoft2.png";
import { useLang } from "../i18n/LanguageContext";

export function Footer() {
  const { t } = useLang();
  const columns = [
    { title: t.footer.productTitle, links: t.footer.product },
    { title: t.footer.companyTitle, links: t.footer.company },
    { title: t.footer.helpTitle, links: t.footer.help },
  ];

  const contacts = [
    { label: t.footer.contacts.address, value: t.footer.contacts.addressValue },
    { label: t.footer.contacts.phone, value: "+7 777 963 17 17" },
    { label: t.footer.contacts.email, value: "hello@utirsoft.kz" },
    { label: t.footer.contacts.whatsapp, value: "+7 777 963 17 17" },
    { label: t.footer.contacts.requisites, value: t.footer.contacts.requisitesValue },
  ];

  return (
    <footer className="bg-white border-t border-slate-100 py-16">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center">
              <img src={logoImg} alt="UTIR soft" className="h-10 w-auto object-contain rounded-lg" />
            </div>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">{t.footer.mission}</p>
            <div className="mt-5 flex items-center gap-3">
              {[
                { icon: Instagram, label: "Instagram" },
                { icon: Youtube, label: "YouTube" },
                { icon: Send, label: "Telegram" },
                { icon: TikTokIcon, label: "TikTok" },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-[#58c084] hover:border-[#58c084]/40 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm text-slate-900 mb-4">{col.title}</h4>
              <ul className="space-y-3 text-sm">
                {col.links.map((link: string) => (
                  <li key={link}>
                    <a href="#" className="text-slate-500 hover:text-slate-900 transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-sm text-slate-900 mb-4">{t.footer.contactsTitle}</h4>
            <ul className="space-y-3 text-sm">
              {contacts.map((c) => (
                <li key={c.label}>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">{c.label}</div>
                  <div className="text-slate-600 mt-0.5">{c.value}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs text-slate-500">
          <p>{t.footer.copyright}</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
            <a href="#" className="hover:text-slate-900 transition-colors">{t.footer.offer}</a>
            <a href="#" className="hover:text-slate-900 transition-colors">{t.footer.privacy}</a>
            <a href="#" className="hover:text-slate-900 transition-colors">{t.footer.consent}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 5.5a4.5 4.5 0 0 0 4 4v3a7.5 7.5 0 0 1-4-1.2v5.7a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v3a2.5 2.5 0 1 0 1.6 2.4V3h3v2.5z" />
    </svg>
  );
}
