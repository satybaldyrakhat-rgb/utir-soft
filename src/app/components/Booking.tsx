import { useState } from 'react';
import { ChefHat, Archive, Shirt, DoorOpen, Baby, Bed, Briefcase, Box, MapPin, ChevronLeft, ChevronRight, CheckCircle2, Calendar, Send } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

const FURNITURE = [
  { id: 'kitchen', label: 'Кухня', icon: ChefHat },
  { id: 'wardrobe', label: 'Шкаф-купе', icon: Archive },
  { id: 'dressing', label: 'Гардеробная', icon: Shirt },
  { id: 'hallway', label: 'Прихожая', icon: DoorOpen },
  { id: 'kids', label: 'Детская', icon: Baby },
  { id: 'bedroom', label: 'Спальня', icon: Bed },
  { id: 'office', label: 'Офисная', icon: Briefcase },
  { id: 'other', label: 'Другое', icon: Box },
];

const SLOTS = ['9:00–11:00', '11:00–13:00', '14:00–16:00', '16:00–18:00'];

export function Booking() {
  const store = useDataStore();
  const [step, setStep] = useState(0);
  const [furnitureType, setFurnitureType] = useState('');
  const [address, setAddress] = useState('');
  const [newBuild, setNewBuild] = useState(false);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedMeasurer, setSelectedMeasurer] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameWa, setSameWa] = useState(true);
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [done, setDone] = useState(false);
  const [trackId, setTrackId] = useState('');

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d;
  });

  const submit = () => {
    const productLabel = FURNITURE.find(f => f.id === furnitureType)?.label || 'Изделие';
    const measurementDate = days[selectedDate || 0]?.toISOString().slice(0, 10) || '';
    try {
      const created = store.addDeal({
        customerName: name,
        phone,
        address,
        product: productLabel,
        furnitureType: productLabel,
        amount: 0,
        paidAmount: 0,
        status: 'new',
        icon: 'phone',
        priority: 'medium',
        date: days[selectedDate || 0]?.toLocaleDateString('ru-RU') || '',
        progress: 5,
        source: 'Сайт',
        measurer: selectedMeasurer || '',
        designer: '',
        materials: '',
        measurementDate,
        completionDate: '',
        installationDate: '',
        paymentMethods: { cash: false, kaspiGold: false, kaspiQR: false, halykBank: false, cardTransfer: false, installment: false },
        notes: notes ? `${notes}\nСлот: ${selectedSlot}` : `Слот: ${selectedSlot}`,
      });
      setTrackId(created.id);
    } catch (err) {
      console.error('[booking submit]', err);
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-gray-900 mb-2">Запись подтверждена!</h2>
          <p className="text-xs text-gray-500 mb-1">{selectedMeasurer ? `Замерщик ${selectedMeasurer} приедет` : 'Замерщик будет назначен'}</p>
          <p className="text-sm text-gray-900 mb-4">{days[selectedDate || 0]?.toLocaleDateString('ru-RU')} в {selectedSlot}</p>
          <p className="text-[11px] text-gray-400 mb-1">За день до визита мы отправим напоминание в WhatsApp.</p>
          <p className="text-[11px] text-gray-400 mb-5">Ссылка для отслеживания: <a href={`#/track/${trackId}`} className="text-gray-900">utir.kz/track/{trackId}</a></p>
          <div className="space-y-2">
            <a href="https://t.me/UtirSoftBot" className="block w-full py-2.5 bg-sky-500 text-white rounded-xl text-xs hover:bg-sky-600 flex items-center justify-center gap-1.5"><Send className="w-3.5 h-3.5" /> Открыть в Telegram</a>
            <button className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs hover:bg-gray-200 flex items-center justify-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Сохранить в календарь</button>
            <a href="#/" className="block w-full py-2.5 text-gray-500 rounded-xl text-xs hover:text-gray-900">На главную</a>
          </div>
        </div>
      </div>
    );
  }

  const canNext = (
    (step === 0 && furnitureType) ||
    (step === 1 && address) ||
    (step === 2 && selectedDate !== null && selectedSlot && selectedMeasurer) ||
    (step === 3 && name && phone) ||
    (step === 4 && agree)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center text-white text-xs">U</div>
            <div className="text-sm text-gray-900">Запись на замер</div>
          </div>
          <a href="#/" className="text-[11px] text-gray-400">utir.kz</a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-5">
        <div className="flex gap-1.5 mb-5">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4 min-h-[400px]">
          {step === 0 && (
            <>
              <h2 className="text-gray-900 mb-4">Что нужно?</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FURNITURE.map(f => {
                  const I = f.icon;
                  return (
                    <button key={f.id} onClick={() => setFurnitureType(f.id)}
                      className={`p-4 rounded-2xl border text-center transition ${furnitureType === f.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <I className="w-6 h-6 mx-auto mb-2 text-gray-700" />
                      <div className="text-xs text-gray-900">{f.label}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-gray-900 mb-4">Адрес объекта</h2>
              <div className="space-y-3">
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="ул. Абая 45, кв. 12"
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                <div className="bg-gray-50 rounded-2xl h-48 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#0001_1px,transparent_1px),linear-gradient(to_bottom,#0001_1px,transparent_1px)] bg-[size:30px_30px] rounded-2xl" />
                  <MapPin className="w-8 h-8 text-rose-500 relative" />
                  <div className="absolute bottom-2 left-3 text-[10px] text-gray-400">2GIS</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newBuild} onChange={() => setNewBuild(!newBuild)} />
                  <span className="text-xs text-gray-700">Это новостройка / квартира на ремонте</span>
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-gray-900 mb-4">Когда удобно?</h2>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {days.map((d, i) => (
                  <button key={i} onClick={() => setSelectedDate(i)}
                    className={`p-2 rounded-xl text-center ${selectedDate === i ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                    <div className="text-[9px] opacity-70">{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</div>
                    <div className="text-xs">{d.getDate()}</div>
                  </button>
                ))}
              </div>
              {selectedDate !== null && (() => {
                const measurers = store.employees
                  .filter(e => e.status === 'active' && (e.department === 'Замеры' || e.role === 'production'))
                  .map(e => e.name);
                return (
                  <div className="space-y-2">
                    {SLOTS.map(slot => (
                      <button key={slot} disabled={measurers.length === 0} onClick={() => { setSelectedSlot(slot); setSelectedMeasurer(measurers[0] || ''); }}
                        className={`w-full p-3 rounded-xl flex items-center justify-between text-xs ${measurers.length === 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : selectedSlot === slot ? 'bg-gray-900 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                        <span>{slot}</span>
                        <span className="text-[10px]">{measurers.length === 0 ? 'Нет свободных замерщиков' : `Свободно: ${measurers.join(', ')}`}</span>
                      </button>
                    ))}
                    {selectedSlot && measurers.length > 1 && (
                      <div className="flex gap-2 pt-2 flex-wrap">
                        {measurers.map(m => (
                          <button key={m} onClick={() => setSelectedMeasurer(m)}
                            className={`px-3 py-1.5 rounded-lg text-xs ${selectedMeasurer === m ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700'}`}>{m}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-gray-900 mb-4">Контакты</h2>
              <div className="space-y-3">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя"
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__"
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sameWa} onChange={() => setSameWa(!sameWa)} />
                  <span className="text-xs text-gray-700">WhatsApp на этом же номере</span>
                </label>
                {!sameWa && (
                  <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="WhatsApp номер"
                    className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                )}
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Дополнительные пожелания" rows={3}
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-gray-900 mb-4">Подтверждение</h2>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-xs mb-4">
                <div className="flex justify-between"><span className="text-gray-400">Тип</span><span className="text-gray-900">{FURNITURE.find(f => f.id === furnitureType)?.label}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Адрес</span><span className="text-gray-900 text-right">{address}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Дата</span><span className="text-gray-900">{days[selectedDate!]?.toLocaleDateString('ru-RU')} {selectedSlot}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Замерщик</span><span className="text-gray-900">{selectedMeasurer}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Имя</span><span className="text-gray-900">{name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Телефон</span><span className="text-gray-900">{phone}</span></div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} className="mt-0.5" />
                <span className="text-xs text-gray-700">Согласен на обработку персональных данных</span>
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs hover:bg-gray-50">
              <ChevronLeft className="w-3.5 h-3.5" /> Назад
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext}
              className="flex items-center gap-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-40">
              Далее <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={submit} disabled={!agree}
              className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600 disabled:opacity-40">
              Подтвердить запись
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
