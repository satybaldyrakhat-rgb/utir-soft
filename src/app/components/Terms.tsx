import { LegalPage, LegalSection } from './LegalPage';

interface Props {
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange: (lang: 'kz' | 'ru' | 'eng') => void;
}

export function Terms({ language, onLanguageChange }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  return (
    <LegalPage
      language={language}
      onLanguageChange={onLanguageChange}
      title={l('Условия использования', 'Пайдалану шарттары', 'Terms of Use')}
      updated={l('Редакция от 15 мая 2026 г.', '2026 жылғы 15 мамырдағы редакция', 'Last updated: May 15, 2026')}
    >
      <p>
        {l(
          'Настоящие Условия использования (далее — «Условия») регулируют отношения между Администрацией платформы Utir Soft (далее — «Сервис») и физическим или юридическим лицом, использующим Сервис (далее — «Пользователь»). Используя Сервис, Пользователь подтверждает, что ознакомился с настоящими Условиями и принимает их в полном объёме.',
          'Осы Пайдалану шарттары (бұдан әрі — «Шарттар») Utir Soft платформасы Әкімшілігі (бұдан әрі — «Сервис») мен Сервисті пайдаланушы жеке немесе заңды тұлға (бұдан әрі — «Пайдаланушы») арасындағы қатынастарды реттейді. Сервисті пайдалану арқылы Пайдаланушы осы Шарттармен танысқанын және оларды толық көлемде қабылдайтынын растайды.',
          'These Terms of Use (the "Terms") govern the relationship between the administration of the Utir Soft platform (the "Service") and any individual or legal entity using the Service (the "User"). By using the Service, the User confirms that they have read these Terms and accept them in full.'
        )}
      </p>

      <LegalSection num={1} title={l('Термины и определения', 'Терминдер мен анықтамалар', 'Definitions')}>
        <p>{l('«Сервис» — программный продукт Utir Soft, доступный через веб-интерфейс по адресу платформы, а также связанные с ним материалы и документация.', '«Сервис» — Utir Soft бағдарламалық өнімі, платформа мекенжайы бойынша веб-интерфейс арқылы қол жетімді, оған байланысты материалдар мен құжаттама.', '"Service" means the Utir Soft software product, accessible via the platform web interface, together with related materials and documentation.')}</p>
        <p>{l('«Пользователь» — лицо, прошедшее регистрацию и принявшее настоящие Условия.', '«Пайдаланушы» — тіркелуден өткен және осы Шарттарды қабылдаған тұлға.', '"User" means a person who has registered and accepted these Terms.')}</p>
        <p>{l('«Аккаунт» — учётная запись Пользователя в Сервисе, защищённая паролем и привязанная к адресу электронной почты.', '«Аккаунт» — Пайдаланушының Сервистегі есептік жазбасы, құпия сөзбен қорғалған және электрондық пошта мекенжайымен байланысты.', '"Account" means the User\'s account in the Service, password-protected and linked to an email address.')}</p>
      </LegalSection>

      <LegalSection num={2} title={l('Регистрация и аккаунт', 'Тіркелу және аккаунт', 'Registration and account')}>
        <p>{l('Для использования Сервиса требуется регистрация. При регистрации Пользователь предоставляет действительный адрес электронной почты, имя и название компании, а также создаёт пароль установленной сложности.', 'Сервисті пайдалану үшін тіркелу қажет. Тіркелу кезінде Пайдаланушы жарамды электрондық пошта мекенжайын, есімін және компания атауын береді, сондай-ақ белгіленген күрделіліктегі құпия сөзді жасайды.', 'Registration is required to use the Service. During registration the User provides a valid email address, name and company name, and sets a password meeting the required complexity.')}</p>
        <p>{l('Пользователь несёт ответственность за достоверность предоставленных данных и за сохранность учётных данных. Обо всех случаях несанкционированного доступа к аккаунту необходимо немедленно сообщить Администрации Сервиса.', 'Пайдаланушы берілген деректердің дұрыстығына және есептік деректерді сақтауға жауап береді. Аккаунтқа рұқсатсыз қол жеткізудің барлық жағдайлары туралы Сервис Әкімшілігіне дереу хабарлау қажет.', 'The User is responsible for the accuracy of provided data and for keeping credentials safe. Any unauthorized access to the account must be reported to the Service Administration immediately.')}</p>
        <p>{l('Один Пользователь может иметь только один аккаунт. Передача аккаунта третьим лицам не допускается.', 'Бір Пайдаланушыда тек бір аккаунт болуы мүмкін. Аккаунтты үшінші тұлғаларға беруге жол берілмейді.', 'A User may have only one account. Transferring accounts to third parties is not permitted.')}</p>
      </LegalSection>

      <LegalSection num={3} title={l('Предмет соглашения', 'Келісім мәні', 'Subject of the agreement')}>
        <p>{l('Сервис предоставляет Пользователю функциональность для управления заказами, клиентами, командой, финансами и другими бизнес-процессами в рамках выбранного тарифного плана.', 'Сервис Пайдаланушыға тапсырыстарды, клиенттерді, команданы, қаржыны және басқа бизнес-процестерді басқару функционалын таңдалған тариф шеңберінде ұсынады.', 'The Service provides the User with functionality for managing orders, clients, team, finances and other business processes within the selected plan.')}</p>
        <p>{l('Сервис предоставляется на условиях «как есть» (as is). Администрация прилагает разумные усилия для обеспечения работоспособности Сервиса, но не гарантирует его непрерывной и безошибочной работы.', 'Сервис «бар күйінде» (as is) шарттарында ұсынылады. Әкімшілік Сервистің жұмыс істеуін қамтамасыз ету үшін ақылға қонымды күш салады, бірақ оның үздіксіз және қатесіз жұмысына кепілдік бермейді.', 'The Service is provided on an "as is" basis. The Administration makes reasonable efforts to keep the Service operational but does not guarantee uninterrupted or error-free operation.')}</p>
      </LegalSection>

      <LegalSection num={4} title={l('Права и обязанности Пользователя', 'Пайдаланушының құқықтары мен міндеттері', 'User\'s rights and obligations')}>
        <p>{l('Пользователь имеет право использовать Сервис в рамках предусмотренной функциональности, изменять и удалять собственные данные, отказаться от использования Сервиса в любое время.', 'Пайдаланушы Сервисті қарастырылған функционал шеңберінде пайдалануға, өз деректерін өзгертуге және жоюға, Сервисті пайдаланудан кез келген уақытта бас тартуға құқылы.', 'The User may use the Service within its intended functionality, edit and delete their own data, and stop using the Service at any time.')}</p>
        <p>{l('Пользователь обязуется: соблюдать законодательство Республики Казахстан; не использовать Сервис для распространения противоправного, оскорбительного или вредоносного контента; не вмешиваться в работу Сервиса техническими средствами.', 'Пайдаланушы: Қазақстан Республикасының заңнамасын сақтауға; Сервисті заңға қайшы, қорлайтын немесе зиянды контентті таратуға пайдаланбауға; Сервистің жұмысына техникалық құралдармен араласпауға міндеттенеді.', 'The User undertakes: to comply with the laws of the Republic of Kazakhstan; not to use the Service to distribute illegal, abusive or harmful content; not to interfere with the Service by technical means.')}</p>
      </LegalSection>

      <LegalSection num={5} title={l('Права и обязанности Сервиса', 'Сервистің құқықтары мен міндеттері', 'Service\'s rights and obligations')}>
        <p>{l('Сервис обязуется: обеспечивать конфиденциальность данных Пользователя в соответствии с Политикой конфиденциальности; оперативно реагировать на сообщения о нарушениях; уведомлять об изменениях в Условиях.', 'Сервис: Пайдаланушы деректерінің құпиялылығын Құпиялылық саясатына сәйкес қамтамасыз етуге; бұзушылықтар туралы хабарламаларға жедел жауап беруге; Шарттардағы өзгерістер туралы хабарлауға міндеттенеді.', 'The Service undertakes: to keep User data confidential in accordance with the Privacy Policy; to respond promptly to abuse reports; to notify users of changes to these Terms.')}</p>
        <p>{l('Сервис имеет право: проводить технические работы; ограничивать доступ к аккаунту в случае нарушения Условий; вносить изменения в функциональность Сервиса.', 'Сервистің: техникалық жұмыстар жүргізуге; Шарттар бұзылған жағдайда аккаунтқа қол жеткізуді шектеуге; Сервис функционалына өзгерістер енгізуге құқығы бар.', 'The Service may: perform maintenance; restrict account access in case of Terms violations; modify the Service\'s functionality.')}</p>
      </LegalSection>

      <LegalSection num={6} title={l('Оплата и тарифы', 'Төлем және тарифтер', 'Payment and pricing')}>
        <p>{l('Базовая функциональность Сервиса может предоставляться бесплатно. Расширенные возможности и тарифные планы публикуются отдельно на сайте Сервиса. Все суммы указываются в тенге Республики Казахстан (KZT).', 'Сервистің негізгі функционалы тегін ұсынылуы мүмкін. Кеңейтілген мүмкіндіктер мен тарифтік жоспарлар Сервис сайтында бөлек жарияланады. Барлық сомалар Қазақстан Республикасының теңгесінде (KZT) көрсетіледі.', 'Basic Service functionality may be provided free of charge. Extended features and pricing plans are published separately on the Service\'s website. All amounts are denominated in Kazakhstani tenge (KZT).')}</p>
      </LegalSection>

      <LegalSection num={7} title={l('Интеллектуальная собственность', 'Зияткерлік меншік', 'Intellectual property')}>
        <p>{l('Все права на программное обеспечение, дизайн, торговые знаки и материалы Сервиса принадлежат Администрации. Пользователю предоставляется простая (неисключительная) лицензия на использование Сервиса в рамках настоящих Условий.', 'Сервистің бағдарламалық қамтамасыз етуіне, дизайнына, сауда белгілеріне және материалдарына барлық құқықтар Әкімшілікке тиесілі. Пайдаланушыға осы Шарттар шеңберінде Сервисті пайдалануға қарапайым (ерекше емес) лицензия беріледі.', 'All rights to the Service\'s software, design, trademarks and materials belong to the Administration. The User is granted a non-exclusive license to use the Service within these Terms.')}</p>
        <p>{l('Данные, которые Пользователь загружает в Сервис, остаются его собственностью. Сервис обрабатывает их только в целях, предусмотренных настоящими Условиями и Политикой конфиденциальности.', 'Пайдаланушы Сервиске жүктейтін деректер оның меншігі болып қалады. Сервис оларды тек осы Шарттарда және Құпиялылық саясатында көзделген мақсаттарда өңдейді.', 'Data uploaded to the Service by the User remains their property. The Service processes it only for purposes set out in these Terms and the Privacy Policy.')}</p>
      </LegalSection>

      <LegalSection num={8} title={l('Ограничение ответственности', 'Жауапкершілікті шектеу', 'Limitation of liability')}>
        <p>{l('Сервис не несёт ответственности за: упущенную выгоду; косвенные убытки; утрату данных, вызванную действиями Пользователя; перебои в работе третьих сервисов и интернет-провайдеров.', 'Сервис: жоғалған пайдаға; жанама шығындарға; Пайдаланушының әрекеттерінен туындаған деректердің жоғалуына; үшінші тарап сервистері мен интернет-провайдерлерінің жұмысындағы үзілістерге жауап бермейді.', 'The Service is not liable for: lost profits; indirect damages; data loss caused by the User; outages of third-party services or internet providers.')}</p>
        <p>{l('Общая ответственность Администрации Сервиса в любом случае ограничивается суммой, фактически уплаченной Пользователем за использование Сервиса за последние 12 месяцев.', 'Сервис Әкімшілігінің жалпы жауапкершілігі кез келген жағдайда соңғы 12 айдағы Сервисті пайдаланғаны үшін Пайдаланушы нақты төлеген сомамен шектеледі.', 'The Service Administration\'s aggregate liability is in any event limited to the amount actually paid by the User for use of the Service over the preceding 12 months.')}</p>
      </LegalSection>

      <LegalSection num={9} title={l('Прекращение использования', 'Пайдалануды тоқтату', 'Termination')}>
        <p>{l('Пользователь может прекратить использование Сервиса и удалить аккаунт в любой момент. Администрация может приостановить или прекратить доступ Пользователя к Сервису в случае существенного нарушения настоящих Условий, уведомив об этом по электронной почте.', 'Пайдаланушы Сервисті пайдалануды тоқтата алады және аккаунтты кез келген уақытта жоя алады. Әкімшілік осы Шарттардың елеулі бұзылуы жағдайында Пайдаланушының Сервиске қол жеткізуін тоқтата немесе тоқтата алады, бұл туралы электрондық пошта арқылы хабарлайды.', 'The User may stop using the Service and delete their account at any time. The Administration may suspend or terminate the User\'s access in case of a material breach of these Terms, notifying them by email.')}</p>
      </LegalSection>

      <LegalSection num={10} title={l('Применимое право и разрешение споров', 'Қолданылатын құқық және дауларды шешу', 'Governing law and dispute resolution')}>
        <p>{l('Настоящие Условия регулируются законодательством Республики Казахстан. Все споры разрешаются путём переговоров; в случае невозможности досудебного урегулирования — в судебном порядке по месту нахождения Администрации Сервиса.', 'Осы Шарттар Қазақстан Республикасының заңнамасымен реттеледі. Барлық даулар келіссөздер арқылы шешіледі; сотқа дейінгі реттеу мүмкін болмаған жағдайда — Сервис Әкімшілігінің орналасқан жері бойынша сот тәртібімен.', 'These Terms are governed by the laws of the Republic of Kazakhstan. Disputes are resolved by negotiation; failing that, in courts at the seat of the Service Administration.')}</p>
      </LegalSection>

      <LegalSection num={11} title={l('Изменение Условий', 'Шарттарды өзгерту', 'Changes to the Terms')}>
        <p>{l('Администрация вправе вносить изменения в настоящие Условия. Актуальная редакция всегда доступна по адресу страницы. О существенных изменениях Пользователь уведомляется по электронной почте.', 'Әкімшілік осы Шарттарға өзгерістер енгізуге құқылы. Өзекті редакция әрқашан осы беттің мекенжайында қол жетімді. Елеулі өзгерістер туралы Пайдаланушы электрондық пошта арқылы хабарланады.', 'The Administration may amend these Terms. The current version is always available at the page URL. Material changes are communicated to the User by email.')}</p>
      </LegalSection>

      <LegalSection num={12} title={l('Контакты', 'Байланыс', 'Contacts')}>
        <p>{l('Замените в финальной версии: укажите официальное наименование компании-владельца, БИН, юридический адрес и контактный e-mail для обращений по вопросам, связанным с настоящими Условиями.', 'Қорытынды нұсқада ауыстырыңыз: осы Шарттарға байланысты мәселелер бойынша иесі компанияның ресми атауын, БСН, заңды мекенжайын және байланыс e-mail-ін көрсетіңіз.', 'Replace in the final version: state the legal name of the owning company, BIN, registered address and a contact email for queries related to these Terms.')}</p>
      </LegalSection>
    </LegalPage>
  );
}
