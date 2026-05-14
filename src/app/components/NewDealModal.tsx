import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Upload, Home, Box, Archive, DoorOpen, Baby, Bed, Briefcase, MoreHorizontal } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

interface Props { language: 'kz' | 'ru' | 'eng'; onClose: () => void; }
const MEASURERS = ['Алихан', 'Нұрлан', 'Арман'];

export function NewDealModal({ language, onClose }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(0);
  const [client, setClient] = useState({ name: '', phone: '', email: '', address: '', source: 'Instagram' });
  const [product, setProduct] = useState({ type: 'Кухня', template: '', l: 3, w: 0.6, h: 0.9, material: 'ЛДСП Egger', color: '', hardware: 'Blum', addons: [] as string[] });
  const [term, setTerm] = useState({ measureDate: '', measurer: 'Алихан', readyDate: '', installDate: '', amount: 0, payMethod: 'Kaspi Gold', prepay: 50 });
  const [docs, setDocs] = useState({ notes: '' });

  const FURNITURE = [
    { id: 'Кухня', icon: Home }, { id: 'Шкаф-купе', icon: Box }, { id: 'Гардеробная', icon: Archive }, { id: 'Прихожая', icon: DoorOpen },
    { id: 'Детская', icon: Baby }, { id: 'Спальня', icon: Bed }, { id: 'Офисная', icon: Briefcase }, { id: 'Другое', icon: MoreHorizontal },
  ];
  const TABS = [l('Клиент', 'Клиент', 'Client'), l('Изделие', 'Бұйым', 'Product'), l('Срок и оплата', 'Мерзім', 'Term & Pay'), l('Документы', 'Құжаттар', 'Documents')];

  const toggleAddon = (a: string) => setProduct(p => ({ ...p, addons: p.addons.includes(a) ? p.addons.filter(x => x !== a) : [...p.addons, a] }));

  const create = (draft = false) => {
    if (!client.name) return;
    const sourceMap: Record<string, any> = { Instagram: 'instagram', WhatsApp: 'whatsapp', Telegram: 'telegram' };
    store.addDeal({
      customerName: client.name, phone: client.phone, address: client.address,
      product: product.template || `${product.type} ${product.l}×${product.w}×${product.h}м`,
      furnitureType: product.type, amount: term.amount, paidAmount: Math.round(term.amount * term.prepay / 100),
      status: draft ? 'new' : 'measured', icon: sourceMap[client.source] || 'phone', priority: 'medium',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      progress: draft ? 5 : 25, source: client.source,
      measurer: term.measurer, designer: '', materials: product.material,
      measurementDate: term.measureDate, completionDate: term.readyDate, installationDate: term.installDate,
      paymentMethods: { cash: term.payMethod === 'Наличные', kaspiGold: term.payMethod === 'Kaspi Gold', kaspiQR: term.payMethod === 'Kaspi QR', cardTransfer: term.payMethod === 'Halyk' || term.payMethod === 'Карта', installment: term.payMethod === 'Рассрочка 0-0-12' },
      notes: docs.notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between">
          <span className="text-sm text-gray-900">{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}</span>
          <button onClick={onClose} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>
        <div className="px-5 pt-4 flex gap-1.5 border-b border-gray-50 overflow-x-auto">
          {TABS.map((label, i) => (
            <button key={i} onClick={() => setTab(i as any)} className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-all ${tab === i ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{i + 1}. {label}</button>
          ))}
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {tab === 0 && (<>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Имя клиента', 'Клиент аты', 'Client Name')}</label><input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} placeholder="Иван Иванов" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Телефон', 'Телефон', 'Phone')}</label><input value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} placeholder="+7 (700) 123-45-67" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">Email</label><input value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} placeholder="email@example.kz" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Адрес объекта', 'Нысан мекенжайы', 'Object address')}</label><input value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} placeholder="ул. Абая 45" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Источник', 'Көзі', 'Source')}</label>
              <select value={client.source} onChange={e => setClient({ ...client, source: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                {['Instagram', 'WhatsApp', 'Telegram', 'Сайт', 'Рекомендация', 'Реклама Meta', 'Звонок', 'Visit'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </>)}
          {tab === 1 && (<>
            <div><label className="block text-[11px] text-gray-400 mb-2">{l('Тип мебели', 'Мебел түрі', 'Furniture type')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FURNITURE.map(f => { const Icon = f.icon; const active = product.type === f.id;
                  return <button key={f.id} onClick={() => setProduct({ ...product, type: f.id })} className={`p-3 border rounded-xl flex flex-col items-center gap-1.5 transition-all ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 text-gray-700 hover:border-gray-300'}`}><Icon className="w-4 h-4" /><span className="text-[11px]">{f.id}</span></button>;
                })}
              </div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Шаблон изделия', 'Шаблон', 'Template')}</label>
              <select value={product.template} onChange={e => setProduct({ ...product, template: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                <option value="">{l('Не выбрано', 'Таңдалмаған', 'None')}</option><option>Кухня угловая премиум</option><option>Кухня прямая эконом</option><option>Шкаф-купе 3-дверный</option><option>Гардеробная П-образная</option>
              </select>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Габариты (м)', 'Өлшемдері (м)', 'Dimensions (m)')}</label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" step="0.1" value={product.l} onChange={e => setProduct({ ...product, l: +e.target.value })} placeholder="Длина" className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
                <input type="number" step="0.1" value={product.w} onChange={e => setProduct({ ...product, w: +e.target.value })} placeholder="Ширина" className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
                <input type="number" step="0.1" value={product.h} onChange={e => setProduct({ ...product, h: +e.target.value })} placeholder="Высота" className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Материал', 'Материал', 'Material')}</label>
                <select value={product.material} onChange={e => setProduct({ ...product, material: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                  {['ЛДСП Egger', 'ЛДСП Kronospan', 'МДФ', 'Массив дерева'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Цвет / Декор', 'Түс / Декор', 'Color')}</label><input value={product.color} onChange={e => setProduct({ ...product, color: e.target.value })} placeholder="Дуб сонома" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-2">{l('Фурнитура', 'Фурнитура', 'Hardware')}</label>
              <div className="flex gap-2 flex-wrap">
                {[{ id: 'Blum', label: 'Blum (премиум)' }, { id: 'Hettich', label: 'Hettich (стандарт)' }, { id: 'Эконом', label: 'Эконом' }].map(h => (
                  <label key={h.id} className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs cursor-pointer ${product.hardware === h.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}>
                    <input type="radio" checked={product.hardware === h.id} onChange={() => setProduct({ ...product, hardware: h.id })} />{h.label}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-2">{l('Доп. опции', 'Қосымша', 'Add-ons')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {['Подсветка LED', 'Мягкое закрывание Blum', 'Встроенная техника', 'Выдвижные ящики'].map(a => (
                  <label key={a} className="flex items-center gap-2 p-2.5 border border-gray-100 rounded-xl text-xs cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={product.addons.includes(a)} onChange={() => toggleAddon(a)} className="rounded" />{a}
                  </label>
                ))}
              </div>
            </div>
          </>)}
          {tab === 2 && (<>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Дата замера', 'Өлшеу күні', 'Measure date')}</label><input type="date" value={term.measureDate} onChange={e => setTerm({ ...term, measureDate: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Замерщик', 'Өлшеуші', 'Measurer')}</label>
                <select value={term.measurer} onChange={e => setTerm({ ...term, measurer: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">{MEASURERS.map(m => <option key={m}>{m}</option>)}</select>
              </div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Готовность', 'Дайын болу', 'Ready')}</label><input type="date" value={term.readyDate} onChange={e => setTerm({ ...term, readyDate: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Установка', 'Орнату', 'Install')}</label><input type="date" value={term.installDate} onChange={e => setTerm({ ...term, installDate: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Сумма (₸)', 'Сома (₸)', 'Amount (₸)')}</label><input type="number" value={term.amount || ''} onChange={e => setTerm({ ...term, amount: +e.target.value })} placeholder="0" className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
            <div><label className="block text-[11px] text-gray-400 mb-2">{l('Способ оплаты', 'Төлем', 'Payment')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {['Наличные', 'Kaspi Gold', 'Kaspi QR', 'Halyk', 'Карта', 'Рассрочка 0-0-12'].map(p => (
                  <label key={p} className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-[11px] cursor-pointer ${term.payMethod === p ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}>
                    <input type="radio" checked={term.payMethod === p} onChange={() => setTerm({ ...term, payMethod: p })} />{p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{l(`Предоплата ${term.prepay}%`, `Алдын ала ${term.prepay}%`, `Prepay ${term.prepay}%`)}</label>
              <input type="range" min="0" max="100" value={term.prepay} onChange={e => setTerm({ ...term, prepay: +e.target.value })} className="w-full" />
              <div className="text-[11px] text-gray-500 mt-1">{Math.round(term.amount * term.prepay / 100).toLocaleString('ru-RU')} ₸</div>
            </div>
          </>)}
          {tab === 3 && (<>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Эскизы / чертежи', 'Эскиздер', 'Sketches')}</label>
              <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center hover:bg-gray-50 cursor-pointer"><Upload className="w-5 h-5 text-gray-400 mx-auto mb-2" /><div className="text-xs text-gray-500">{l('Перетащите файлы сюда', 'Файлдарды осында', 'Drop files')}</div></div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Договор', 'Шарт', 'Contract')}</label>
              <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center hover:bg-gray-50 cursor-pointer"><Upload className="w-5 h-5 text-gray-400 mx-auto mb-2" /><div className="text-xs text-gray-500">PDF, DOCX</div></div>
            </div>
            <div><label className="block text-[11px] text-gray-400 mb-1">{l('Заметки менеджера', 'Жазбалар', 'Notes')}</label><textarea value={docs.notes} onChange={e => setDocs({ ...docs, notes: e.target.value })} rows={4} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" /></div>
          </>)}
        </div>
        <div className="p-5 border-t border-gray-50 flex items-center gap-2">
          <button onClick={() => setTab(Math.max(0, tab - 1) as any)} disabled={tab === 0} className="px-3 py-2 text-xs flex items-center gap-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /> {l('Назад', 'Артқа', 'Back')}</button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-900">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
          <button onClick={() => create(true)} className="px-3 py-2 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Черновик', 'Жоба', 'Draft')}</button>
          {tab < 3 ? (
            <button onClick={() => setTab(Math.min(3, tab + 1) as any)} className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 flex items-center gap-1">{l('Вперёд', 'Алға', 'Next')} <ChevronRight className="w-3.5 h-3.5" /></button>
          ) : (
            <button onClick={() => create(false)} className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Создать сделку', 'Мәміле жасау', 'Create deal')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
