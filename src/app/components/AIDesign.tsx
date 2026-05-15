import { useState } from 'react';
import { Upload, Sparkles, Mic, Download, RefreshCw, Check, Sofa, CookingPot, Bath, Monitor, UtensilsCrossed, BedDouble, ChevronDown, Image as ImageIcon, Clock, Heart, Share2, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface AIDesignProps {
  language: 'kz' | 'ru' | 'eng';
}

const galleryItems = [
  { id: 1, img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600', label: 'Кухня', style: 'Минимализм', time: '52с' },
  { id: 2, img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600', label: 'Гостиная', style: 'Минимализм', time: '47с' },
  { id: 3, img: 'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=600', label: 'Спальня', style: 'Минимализм', time: '61с' },
];

const AI_MODELS = [
  { id: 'flux', name: 'Utir Vision Pro', desc: 'Фотореалистичный · 50с' },
  { id: 'sdxl', name: 'Stable Diffusion XL', desc: 'Универсальный · 35с' },
  { id: 'midjourney', name: 'Midjourney v6', desc: 'Премиум · 90с' },
  { id: 'dalle', name: 'DALL·E 3', desc: 'OpenAI · 40с' },
];

type StepKey = 'room' | 'style' | 'size' | 'photo' | 'details';

export function AIDesign({ language }: AIDesignProps) {
  const [activeStep, setActiveStep] = useState<StepKey>('room');
  const [roomType, setRoomType] = useState('');
  const [style, setStyle] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [colorScheme, setColorScheme] = useState('');
  const [lighting, setLighting] = useState('');
  const [material, setMaterial] = useState('');
  const [furniture, setFurniture] = useState('');
  const [wishes, setWishes] = useState('');
  const [roomPhoto, setRoomPhoto] = useState<File | null>(null);
  const [furniturePhoto, setFurniturePhoto] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [model, setModel] = useState(AI_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const roomTypes = [
    { id: 'kitchen', icon: CookingPot, ru: 'Кухня', kz: 'Ас үй', eng: 'Kitchen' },
    { id: 'bedroom', icon: BedDouble, ru: 'Спальня', kz: 'Жатын бөлме', eng: 'Bedroom' },
    { id: 'living', icon: Sofa, ru: 'Гостиная', kz: 'Қонақ бөлме', eng: 'Living' },
    { id: 'bathroom', icon: Bath, ru: 'Ванная', kz: 'Жуынатын', eng: 'Bath' },
    { id: 'office', icon: Monitor, ru: 'Кабинет', kz: 'Кабинет', eng: 'Office' },
    { id: 'dining', icon: UtensilsCrossed, ru: 'Столовая', kz: 'Ас бөлме', eng: 'Dining' },
  ];

  const styles = [
    { id: 'minimalist', img: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=300', ru: 'Минимализм', kz: 'Минимализм', eng: 'Minimalist' },
    { id: 'modern', img: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=300', ru: 'Современный', kz: 'Заманауи', eng: 'Modern' },
    { id: 'scandinavian', img: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=300', ru: 'Сканди', kz: 'Сканди', eng: 'Scandi' },
    { id: 'classic', img: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=300', ru: 'Классика', kz: 'Классика', eng: 'Classic' },
    { id: 'loft', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300', ru: 'Лофт', kz: 'Лофт', eng: 'Loft' },
    { id: 'provence', img: 'https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=300', ru: 'Прованс', kz: 'Прованс', eng: 'Provence' },
  ];

  const colors = [
    { id: 'light', ru: 'Светлая', kz: 'Жарық', eng: 'Light', swatches: ['bg-stone-50', 'bg-stone-100', 'bg-stone-200'] },
    { id: 'dark', ru: 'Тёмная', kz: 'Қараңғы', eng: 'Dark', swatches: ['bg-gray-700', 'bg-gray-800', 'bg-gray-900'] },
    { id: 'neutral', ru: 'Тёплая', kz: 'Жылы', eng: 'Warm', swatches: ['bg-amber-50', 'bg-orange-100', 'bg-amber-200'] },
    { id: 'colorful', ru: 'Холодная', kz: 'Суық', eng: 'Cool', swatches: ['bg-sky-100', 'bg-blue-200', 'bg-indigo-300'] },
  ];

  const STEPS: { id: StepKey; ru: string; kz: string; eng: string; required: boolean; isFilled: () => boolean }[] = [
    { id: 'room', ru: 'Комната', kz: 'Бөлме', eng: 'Room', required: true, isFilled: () => !!roomType },
    { id: 'style', ru: 'Стиль', kz: 'Стиль', eng: 'Style', required: true, isFilled: () => !!style },
    { id: 'size', ru: 'Размеры', kz: 'Өлшем', eng: 'Size', required: true, isFilled: () => !!(length && width && height) },
    { id: 'photo', ru: 'Фото', kz: 'Фото', eng: 'Photo', required: false, isFilled: () => !!roomPhoto },
    { id: 'details', ru: 'Детали', kz: 'Мәлімет', eng: 'Details', required: false, isFilled: () => !!(colorScheme || lighting || material || wishes) },
  ];

  const stepIndex = STEPS.findIndex(s => s.id === activeStep);
  const canGenerate = roomType && style && length && width && height;

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setGeneratedResult(galleryItems[Math.floor(Math.random() * galleryItems.length)].img);
    }, 2500);
  };

  const goNext = () => { if (stepIndex < STEPS.length - 1) setActiveStep(STEPS[stepIndex + 1].id); };
  const goPrev = () => { if (stepIndex > 0) setActiveStep(STEPS[stepIndex - 1].id); };

  const labelCls = 'block text-[10px] text-gray-400 uppercase tracking-[0.08em] mb-1.5';
  const fieldCls = 'w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-200';

  return (
    <div className="min-h-full bg-gray-50/40">
      <div className="max-w-[1280px] mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.12em] mb-1">AI · BETA</p>
            <h1 className="text-gray-900">{l('Дизайн интерьера', 'Интерьер дизайны', 'Interior design')}</h1>
            <p className="text-xs text-gray-500 mt-1">{l('Фотореалистичная визуализация за минуту', 'Бір минутта фотореалистік визуализация', 'Photoreal visualisation in a minute')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[10px] text-gray-500">{l('Генераций', 'Генерациялар', 'Credits')}</span>
              <span className="text-xs text-gray-900 tabular-nums">47</span>
            </div>
            <div className="relative">
              <button onClick={() => setShowModelMenu(!showModelMenu)} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs text-gray-700 hover:border-gray-200">
                <Sparkles className="w-3.5 h-3.5 text-gray-900" />
                {model.name}
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              {showModelMenu && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-30 p-1">
                  {AI_MODELS.map(m => (
                    <button key={m.id} onClick={() => { setModel(m); setShowModelMenu(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 ${model.id === m.id ? 'bg-gray-50' : ''}`}>
                      <div className="text-xs text-gray-900 flex items-center justify-between">
                        {m.name}
                        {model.id === m.id && <Check className="w-3 h-3 text-gray-900" />}
                      </div>
                      <div className="text-[10px] text-gray-400">{m.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-5 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const filled = s.isFilled();
              const active = activeStep === s.id;
              return (
                <button key={s.id} onClick={() => setActiveStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${active ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] tabular-nums transition-colors ${
                    active ? 'bg-white text-gray-900' : filled ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {filled && !active ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className="text-xs whitespace-nowrap">{s[language]}</span>
                  {s.required && <span className={`text-[8px] ${active ? 'text-rose-300' : 'text-rose-400'}`}>*</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ===== LEFT: ACTIVE STEP ===== */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 min-h-[460px] flex flex-col">
              {/* Step content */}
              <div className="flex-1">
                {activeStep === 'room' && (
                  <>
                    <SectionTitle n={1} title={l('Какую комнату оформляем?', 'Қандай бөлме?', 'Which room?')}
                      hint={l('Выберите тип помещения', 'Бөлме түрін таңдаңыз', 'Pick a room type')} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {roomTypes.map(rt => {
                        const Icon = rt.icon;
                        const active = roomType === rt.id;
                        return (
                          <button key={rt.id} onClick={() => setRoomType(rt.id)}
                            className={`flex flex-col items-center gap-2 py-5 rounded-xl border transition-all ${active ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300'}`}>
                            <Icon className={`w-6 h-6 ${active ? 'text-gray-900' : 'text-gray-400'}`} strokeWidth={1.5} />
                            <span className="text-xs text-gray-700">{rt[language]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {activeStep === 'style' && (
                  <>
                    <SectionTitle n={2} title={l('Какой стиль ближе?', 'Қандай стиль?', 'Which style?')}
                      hint={l('Один из шести', 'Алтыдан біреуі', 'One of six')} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {styles.map(s => {
                        const active = style === s.id;
                        return (
                          <button key={s.id} onClick={() => setStyle(s.id)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all group ${active ? 'border-gray-900' : 'border-transparent hover:border-gray-200'}`}>
                            <ImageWithFallback src={s.img} alt={s[language]} className="w-full aspect-[4/3] object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <span className="absolute bottom-2 left-2.5 text-xs text-white">{s[language]}</span>
                            {active && <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-gray-900" /></div>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {activeStep === 'size' && (
                  <>
                    <SectionTitle n={3} title={l('Укажите размеры', 'Өлшемдерді көрсетіңіз', 'Set dimensions')}
                      hint={length && width ? `${(Number(length) * Number(width)).toFixed(1)} м²` : l('в метрах', 'метрмен', 'meters')} />
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'length', label: l('Длина', 'Ұзындық', 'Length'), val: length, set: setLength, ph: '4.5' },
                        { key: 'width', label: l('Ширина', 'Ені', 'Width'), val: width, set: setWidth, ph: '3.2' },
                        { key: 'height', label: l('Высота', 'Биіктік', 'Height'), val: height, set: setHeight, ph: '2.7' },
                      ].map(d => (
                        <div key={d.key} className="border border-gray-100 rounded-xl p-4">
                          <label className={labelCls}>{d.label}</label>
                          <div className="flex items-baseline gap-1">
                            <input type="number" inputMode="decimal" value={d.val} onChange={e => d.set(e.target.value)} placeholder={d.ph}
                              className="flex-1 bg-transparent text-2xl text-gray-900 tabular-nums focus:outline-none placeholder:text-gray-200 min-w-0 w-full" />
                            <span className="text-xs text-gray-400">м</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {length && width && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="bg-gray-50/60 rounded-xl p-3">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">{l('Площадь', 'Аудан', 'Area')}</div>
                          <div className="text-base text-gray-900 tabular-nums">{(Number(length) * Number(width)).toFixed(1)} м²</div>
                        </div>
                        <div className="bg-gray-50/60 rounded-xl p-3">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">{l('Объём', 'Көлем', 'Volume')}</div>
                          <div className="text-base text-gray-900 tabular-nums">{(Number(length) * Number(width) * Number(height || 0)).toFixed(1)} м³</div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeStep === 'photo' && (
                  <>
                    <SectionTitle n={4} title={l('Загрузите фото-референсы', 'Фото-референс жүктеңіз', 'Upload references')}
                      hint={l('опционально', 'міндетті емес', 'optional')} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <UploadBox id="room-photo" label={l('Фото вашей комнаты', 'Сіздің бөлмеңіз', 'Your room')} hint={l('Помогает учесть планировку', 'Жоспарды ескереді', 'Helps with layout')}
                        file={roomPhoto} onUpload={e => e.target.files?.[0] && setRoomPhoto(e.target.files[0])} onClear={() => setRoomPhoto(null)} l={l} />
                      <UploadBox id="furniture-photo" label={l('Пример мебели', 'Жиһаз мысалы', 'Furniture example')} hint={l('AI скопирует стиль', 'AI стильді көшіреді', 'AI mirrors the style')}
                        file={furniturePhoto} onUpload={e => e.target.files?.[0] && setFurniturePhoto(e.target.files[0])} onClear={() => setFurniturePhoto(null)} l={l} />
                    </div>
                  </>
                )}

                {activeStep === 'details' && (
                  <>
                    <SectionTitle n={5} title={l('Тонкая настройка', 'Дәл баптау', 'Fine-tune')}
                      hint={l('опционально, но улучшает результат', 'нәтижені жақсартады', 'optional, improves result')} />

                    <div className="space-y-5">
                      <div>
                        <label className={labelCls}>{l('Палитра', 'Палитра', 'Palette')}</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {colors.map(c => {
                            const active = colorScheme === c.id;
                            return (
                              <button key={c.id} onClick={() => setColorScheme(c.id)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${active ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'}`}>
                                <div className="flex -space-x-1">
                                  {c.swatches.map((sw, i) => (
                                    <span key={i} className={`w-3.5 h-3.5 rounded-full ${sw} ring-1 ring-white`} />
                                  ))}
                                </div>
                                <span className="text-xs text-gray-700">{c[language]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>{l('Освещение', 'Жарық', 'Lighting')}</label>
                          <select value={lighting} onChange={e => setLighting(e.target.value)} className={fieldCls}>
                            <option value="">—</option>
                            <option value="natural">{l('Естественное', 'Табиғи', 'Natural')}</option>
                            <option value="warm">{l('Тёплое', 'Жылы', 'Warm')}</option>
                            <option value="cold">{l('Холодное', 'Суық', 'Cold')}</option>
                            <option value="mixed">{l('Смешанное', 'Аралас', 'Mixed')}</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>{l('Материал', 'Материал', 'Material')}</label>
                          <select value={material} onChange={e => setMaterial(e.target.value)} className={fieldCls}>
                            <option value="">—</option>
                            <option value="wood">{l('Дерево', 'Ағаш', 'Wood')}</option>
                            <option value="mdf">МДФ</option>
                            <option value="plastic">{l('Пластик', 'Пластик', 'Plastic')}</option>
                            <option value="metal">{l('Металл', 'Метал', 'Metal')}</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>{l('Фурнитура', 'Жабдық', 'Hardware')}</label>
                          <select value={furniture} onChange={e => setFurniture(e.target.value)} className={fieldCls}>
                            <option value="">—</option>
                            <option value="modern">{l('Современная', 'Заманауи', 'Modern')}</option>
                            <option value="classic">{l('Классическая', 'Классикалық', 'Classic')}</option>
                            <option value="hidden">{l('Скрытая', 'Жасырын', 'Hidden')}</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>{l('Свободное описание', 'Еркін сипаттама', 'Free description')}</label>
                        <div className="relative">
                          <textarea value={wishes} onChange={e => setWishes(e.target.value.slice(0, 500))} rows={3}
                            placeholder={l('Кухня с островом, барные стулья, светлый дуб, скрытая подсветка…', 'Аралы ас үй…', 'Kitchen with island…')}
                            className="w-full px-3 py-2.5 pr-20 bg-gray-50 border-0 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none placeholder:text-gray-300" />
                          <button className="absolute right-2 bottom-2 flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-100 rounded-lg text-[10px] text-gray-500 hover:bg-gray-50">
                            <Mic className="w-3 h-3" />{l('Голос', 'Дауыс', 'Voice')}
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1.5 tabular-nums text-right">{wishes.length}/500</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Step navigation */}
              <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-gray-50">
                <button onClick={goPrev} disabled={stepIndex === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowLeft className="w-3.5 h-3.5" />{l('Назад', 'Артқа', 'Back')}
                </button>
                <span className="text-[10px] text-gray-400 tabular-nums">{stepIndex + 1} / {STEPS.length}</span>
                {stepIndex < STEPS.length - 1 ? (
                  <button onClick={goNext} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800">
                    {l('Далее', 'Әрі қарай', 'Next')}<ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={handleGenerate} disabled={!canGenerate || isGenerating}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs ${canGenerate && !isGenerating ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                    <Sparkles className="w-3.5 h-3.5" />{l('Сгенерировать', 'Жасау', 'Generate')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ===== RIGHT: PREVIEW ===== */}
          <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm text-gray-900">{l('Превью', 'Превью', 'Preview')}</span>
                {generatedResult && <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  <Check className="w-3 h-3" />{l('Готово', 'Дайын', 'Done')}
                </span>}
              </div>

              {generatedResult ? (
                <div>
                  <div className="relative group">
                    <ImageWithFallback src={generatedResult} alt="Result" className="w-full aspect-[4/3] object-cover" />
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center"><Heart className="w-3.5 h-3.5 text-gray-700" /></button>
                      <button className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center"><Share2 className="w-3.5 h-3.5 text-gray-700" /></button>
                    </div>
                  </div>
                  <div className="p-3 flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
                      <Download className="w-3.5 h-3.5" />{l('Скачать', 'Жүктеу', 'Download')}
                    </button>
                    <button onClick={handleGenerate} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-100 rounded-xl text-xs text-gray-700 hover:bg-gray-50">
                      <RefreshCw className="w-3.5 h-3.5" />{l('Повторить', 'Қайта', 'Redo')}
                    </button>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="p-10 flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
                    <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                  <div className="text-sm text-gray-900 mb-0.5">{l('AI создаёт дизайн', 'AI жасауда', 'AI is creating')}</div>
                  <p className="text-[11px] text-gray-400">{model.name}</p>
                  <div className="w-44 h-0.5 bg-gray-100 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-gray-900 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              ) : (
                <div className="p-10 flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-3 border border-dashed border-gray-200">
                    <ImageIcon className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
                  </div>
                  <div className="text-sm text-gray-900 mb-0.5">{l('Превью появится здесь', 'Превью осында', 'Preview appears here')}</div>
                  <p className="text-[11px] text-gray-400 text-center max-w-[200px]">
                    {l('Заполните шаги 1–3 и нажмите «Сгенерировать»', '1–3 қадамдарды толтырыңыз', 'Complete steps 1–3')}
                  </p>
                </div>
              )}
            </div>

            {/* Brief summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-[10px] text-gray-400 uppercase tracking-[0.08em] mb-3">{l('Ваш бриф', 'Сіздің бриф', 'Your brief')}</div>
              <div className="space-y-2">
                <BriefRow label={l('Комната', 'Бөлме', 'Room')} value={roomType ? roomTypes.find(r => r.id === roomType)?.[language] : null} />
                <BriefRow label={l('Стиль', 'Стиль', 'Style')} value={style ? styles.find(s => s.id === style)?.[language] : null} />
                <BriefRow label={l('Размеры', 'Өлшем', 'Size')} value={length && width ? `${length}×${width}${height ? `×${height}` : ''} м` : null} />
                <BriefRow label={l('Палитра', 'Палитра', 'Palette')} value={colorScheme ? colors.find(c => c.id === colorScheme)?.[language] : null} />
                <BriefRow label={l('Свет', 'Жарық', 'Light')} value={lighting || null} />
                <BriefRow label={l('Материал', 'Материал', 'Material')} value={material || null} />
              </div>
            </div>

            {/* Recent */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm text-gray-900">{l('Последние', 'Соңғылар', 'Recent')}</span>
                <span className="text-[10px] text-gray-400">{galleryItems.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {galleryItems.map(item => (
                  <button key={item.id} onClick={() => setGeneratedResult(item.img)} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50/50 text-left">
                    <ImageWithFallback src={item.img} alt={item.label} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-900 truncate">{item.label}</div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                        <span>{item.style}</span><span>·</span>
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{item.time}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] text-gray-400 uppercase tracking-[0.12em] mb-1.5 tabular-nums">Step {n}</div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-gray-900">{title}</h2>
        {hint && <span className="text-[11px] text-gray-400 flex-shrink-0">{hint}</span>}
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-400">{label}</span>
      {value ? <span className="text-gray-900 truncate">{value}</span> : <span className="text-gray-200">—</span>}
    </div>
  );
}

function UploadBox({ id, label, hint, file, onUpload, onClear, l }: { id: string; label: string; hint: string; file: File | null; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void; l: (ru: string, kz: string, eng: string) => string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-[10px] text-gray-400 uppercase tracking-[0.08em]">{label}</label>
        <span className="text-[10px] text-gray-300">{hint}</span>
      </div>
      {file ? (
        <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-900 truncate">{file.name}</div>
            <div className="text-[10px] text-gray-400">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button onClick={onClear} className="w-7 h-7 hover:bg-white rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>
      ) : (
        <label htmlFor={id} className="block border border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-gray-900 hover:bg-gray-50/50 transition-all cursor-pointer">
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" id={id} />
          <Upload className="w-5 h-5 text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-xs text-gray-700">{l('Загрузить', 'Жүктеу', 'Upload')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG · 10 МБ</p>
        </label>
      )}
    </div>
  );
}
