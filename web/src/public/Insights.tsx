import { useMeta } from '../seo'
import { isAr, t } from '../i18n'

/*
 * Insights: short, practical guides to buying and selling UAE media on Nashr. Written for buyers and publishers who are new to it,
 * in both languages (each article is its own text, not run through t(), so it reads naturally in Arabic).
 */
type Article = { slug: string; date: string; minutes: number; en: { title: string; summary: string; body: string[] }; ar: { title: string; summary: string; body: string[] } }

export const ARTICLES: Article[] = [
  {
    slug: 'auction-fixed-price-or-quick-sale', date: '2026-11-08', minutes: 3,
    en: {
      title: 'Auction, fixed price or quick sale: which should you choose?',
      summary: 'Three ways to sell airtime on Nashr, and when each one earns publishers the most.',
      body: [
        'Every placement on Nashr is sold one of three ways. The choice decides how buyers book and how much the slot can earn.',
        'Auction suits airtime that buyers compete for: drive-time radio, prime-time TV, the front page. Buyers bid in 3% steps until bidding closes, and auto-bid lets them set a maximum so they stay in front without watching. A hidden reserve protects your floor, and an optional buy-now price lets a buyer skip the wait.',
        'Fixed price suits airtime with a known rate card price. The first buyer to book takes the slot off sale at once. You confirm within 24 hours, or switch on automatic confirmation and the buyer is asked to pay straight away.',
        'Quick sale suits last-minute or flexible airtime. Buyers show interest at your price or above, with their brief, and you pick the one you want. The others are told the slot has gone.',
        'Whichever you choose, the buyer pays before the ad runs, the money is held by Nashr, and you are paid once the buyer approves your proof.',
      ],
    },
    ar: {
      title: 'المزاد أم السعر الثابت أم البيع السريع: أيها تختار؟',
      summary: 'ثلاث طرق لبيع المساحات الإعلانية على نشر، ومتى تحقق كل طريقة أعلى عائد للناشر.',
      body: [
        'تُباع كل مساحة على نشر بإحدى ثلاث طرق، ويحدد اختيارك طريقة الحجز ومقدار ما يمكن أن تحققه المساحة.',
        'يناسب المزاد المساحات التي يتنافس عليها المعلنون: إذاعة أوقات الذروة، وتلفزيون وقت الذروة، والصفحة الأولى. يزايد المشترون بخطوات 3% حتى إغلاق المزايدة، وتتيح لهم المزايدة التلقائية تحديد حد أقصى ليبقوا في الصدارة دون متابعة. ويحمي السعر الأدنى المخفي حدك الأدنى، ويتيح سعر الشراء الفوري الاختياري للمشتري تجاوز الانتظار.',
        'يناسب السعر الثابت المساحات ذات السعر المعروف في قائمة الأسعار. أول مشترٍ يحجز يسحب المساحة من البيع فورًا، وتؤكد أنت خلال 24 ساعة، أو تفعّل التأكيد التلقائي فيُطلب من المشتري الدفع مباشرة.',
        'يناسب البيع السريع المساحات القريبة أو المرنة. يبدي المشترون اهتمامهم بسعرك أو أعلى مع ملخص الحجز، وتختار من تريد، ويُبلَّغ الآخرون بأن المساحة حُجزت.',
        'أيًا كان اختيارك، يدفع المشتري قبل بث الإعلان، ويحتفظ نشر بالمبلغ، وتحصل على أموالك بعد موافقة المشتري على إثبات البث.',
      ],
    },
  },
  {
    slug: 'how-payment-protection-works', date: '2026-11-06', minutes: 2,
    en: {
      title: 'How payment protection works on Nashr',
      summary: 'Why buyers pay before the ad runs, and why publishers are paid only after proof.',
      body: [
        'Media buying in the region often runs on trust and long payment terms. Nashr replaces both with one rule: the money waits in the middle.',
        'When a publisher accepts a booking, the buyer pays within 48 hours. The payment is held by Nashr, not by the publisher. The buyer can upload the creative straight away.',
        'After the ad runs, the publisher sends proof: the as-run log and clip for radio and TV, the tearsheet for print, dated screenshots for digital, the episode link for podcasts.',
        'The buyer approves the proof and the publisher is paid. If the buyer does nothing, the payment is released automatically after 5 working days. If something went wrong, the buyer reports an issue and the publisher can offer a fix, a re-run or a partial refund before Nashr steps in.',
        'Contact details stay hidden until a booking is paid, so every deal stays on the record and both sides keep this protection.',
      ],
    },
    ar: {
      title: 'كيف تعمل حماية الدفع على نشر',
      summary: 'لماذا يدفع المشتري قبل بث الإعلان، ولماذا يحصل الناشر على أمواله بعد الإثبات فقط.',
      body: [
        'كثيرًا ما يعتمد شراء الإعلانات في المنطقة على الثقة وفترات سداد طويلة. يستبدل نشر الاثنين بقاعدة واحدة: يبقى المال في المنتصف.',
        'عندما يقبل الناشر الحجز، يدفع المشتري خلال 48 ساعة. يحتفظ نشر بالمبلغ لا الناشر، ويمكن للمشتري رفع المادة الإعلانية فورًا.',
        'بعد بث الإعلان، يرسل الناشر الإثبات: سجل البث والمقطع للإذاعة والتلفزيون، ونسخة الصفحة للمطبوعات، ولقطات شاشة مؤرخة للرقمي، ورابط الحلقة للبودكاست.',
        'يوافق المشتري على الإثبات فيحصل الناشر على أمواله. وإذا لم يتخذ المشتري أي إجراء، يُفرج عن المبلغ تلقائيًا بعد 5 أيام عمل. وإن حدث خطأ، يبلغ المشتري عن مشكلة ويمكن للناشر عرض حل أو إعادة بث أو استرداد جزئي قبل أن يتدخل نشر.',
        'تبقى بيانات التواصل مخفية حتى يُدفع الحجز، فتبقى كل صفقة موثقة ويحتفظ الطرفان بهذه الحماية.',
      ],
    },
  },
  {
    slug: 'planning-a-ramadan-campaign', date: '2026-11-04', minutes: 3,
    en: {
      title: 'Planning a Ramadan campaign on UAE media',
      summary: 'When to book, which airtime moves first, and how to use audiences to plan.',
      body: [
        'Ramadan is the busiest advertising month of the year in the UAE, and the best airtime goes early. Listening and viewing shift towards the evening, around iftar and late at night.',
        'Start by picking the audience, not the outlet. On Nashr, choose "Arabic-speaking families" or "Affluent expats" and you see every slot that reaches them, across radio, TV, print, digital and podcasts.',
        'Book the evening first. Slots around iftar and prime-time TV in the last two weeks are the most contested; set an auto-bid maximum on those so you stay in front without watching every auction.',
        'Leave room for creative. Bidding closes days before air so publishers have time to decide and you have time to pay and deliver. Upload the creative as soon as a publisher accepts.',
        'Keep it in one campaign. Tag every booking to your Ramadan campaign and the Results page shows spend, airings, proof and reach for the whole month, ready to share.',
      ],
    },
    ar: {
      title: 'التخطيط لحملة رمضان على وسائل الإعلام الإماراتية',
      summary: 'متى تحجز، وأي المساحات تُحجز أولًا، وكيف تخطط باستخدام الجماهير.',
      body: [
        'رمضان أكثر شهور السنة ازدحامًا بالإعلانات في الإمارات، وتُحجز أفضل المساحات مبكرًا. ويتجه الاستماع والمشاهدة إلى المساء حول الإفطار وفي ساعات الليل المتأخرة.',
        'ابدأ باختيار الجمهور لا المنصة. على نشر، اختر "العائلات الناطقة بالعربية" أو "المغتربون الميسورون" لترى كل مساحة تصل إليهم في الإذاعة والتلفزيون والمطبوعات والرقمي والبودكاست.',
        'احجز المساء أولًا. المساحات حول الإفطار ووقت الذروة التلفزيوني في الأسبوعين الأخيرين هي الأكثر تنافسًا، فحدد حدًا أقصى للمزايدة التلقائية عليها لتبقى في الصدارة دون متابعة كل مزاد.',
        'اترك وقتًا للمادة الإعلانية. تُغلق المزايدة قبل البث بأيام ليتسع الوقت لقرار الناشر ولدفعك وتسليمك. ارفع المادة فور قبول الناشر.',
        'اجمع كل شيء في حملة واحدة. اربط كل حجز بحملة رمضان، وستعرض صفحة النتائج الإنفاق والبث والإثبات والوصول للشهر كله، جاهزة للمشاركة.',
      ],
    },
  },
]

const text = (a: Article) => isAr ? a.ar : a.en
const when = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(isAr ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function InsightsPage() {
  useMeta({ title: t('Insights: buying and selling UAE media | Nashr'), description: t('Practical guides to booking radio, TV, print, digital and podcast advertising in the UAE.') })
  return <main className="ins-page">
    <h1>{t('Insights')}</h1>
    <p className="lead">{t('Practical guides to buying and selling UAE media, from the Nashr team.')}</p>
    <ul className="ins-list">{ARTICLES.map(a => <li key={a.slug}><a href={`/insights/${a.slug}`} className="card ins-card">
      <span className="small muted">{when(a.date)} · {t('{n} min read', { n: a.minutes })}</span><h2>{text(a).title}</h2><p>{text(a).summary}</p></a></li>)}</ul>
  </main>
}

export function ArticlePage({ id }: { id: string }) {
  const a = ARTICLES.find(x => x.slug === id)
  useMeta(a ? { title: `${text(a).title} | Nashr`, description: text(a).summary,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Article', headline: text(a).title, datePublished: a.date, inLanguage: isAr ? 'ar' : 'en', publisher: { '@type': 'Organization', name: 'Nashr' } }] } : null, [id])
  if (!a) return <main><p>{t('Not found')}</p><a href="/insights">{t('Insights')}</a></main>
  return <main className="ins-page"><article className="ins-article">
    <p className="small"><a href="/insights">{t('Insights')}</a> · {when(a.date)} · {t('{n} min read', { n: a.minutes })}</p>
    <h1>{text(a).title}</h1>
    <p className="lead">{text(a).summary}</p>
    {text(a).body.map((p, i) => <p key={i}>{p}</p>)}
    <div className="row-flex section"><a className="btn primary" href="/calendar">{t('Browse the calendar')}</a><a className="btn" href="/request-access">{t('Request access')}</a></div>
  </article>
    <aside className="section"><h2 className="sec-h">{t('More insights')}</h2><ul className="ins-more">{ARTICLES.filter(x => x.slug !== id).map(x =>
      <li key={x.slug}><a href={`/insights/${x.slug}`}>{text(x).title}</a></li>)}</ul></aside>
  </main>
}
