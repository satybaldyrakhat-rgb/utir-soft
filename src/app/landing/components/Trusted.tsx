import imgDzhebe from "../imports/IMG_3314.PNG";
import imgArshat from "../imports/IMG_3315.JPG";
import imgSapa from "../imports/IMG_8265.PNG";
import imgEra from "../imports/IMG_3319.PNG";

const logos = [
  { name: "Dzhebe Group", src: imgDzhebe, filter: "brightness(0)" },
  { name: "Arshat Doors", src: imgArshat, filter: "invert(1)" },
  { name: "Sapa Group", src: imgSapa, filter: "brightness(0)" },
  { name: "Era Group", src: imgEra, filter: "brightness(0)", customClass: "scale-90" },
];

import { useLang } from "../i18n/LanguageContext";

export function Trusted() {
  const { t } = useLang();
  return (
    <section className="py-20 sm:py-24 bg-white border-y border-slate-100">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm text-[#58c084]">{t.trusted.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.trusted.title1}<br className="hidden sm:block" /> {t.trusted.title2}
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
          {logos.map((logo) => (
            <div
              key={logo.name}
              className="bg-white py-10 px-6 sm:py-14 sm:px-8 flex items-center justify-center"
            >
              <img
                src={logo.src}
                alt={logo.name}
                className={`h-14 sm:h-16 w-auto max-w-full object-contain opacity-75 hover:opacity-100 transition-opacity ${logo.customClass || ''}`}
                style={{ filter: logo.filter }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
