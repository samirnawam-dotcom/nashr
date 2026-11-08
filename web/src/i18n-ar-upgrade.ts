/* Arabic for the buyer and publisher upgrade: messages, the Order, withdrawing a request, the company page, the bid panel's commitment,
   editing a placement, auto-accept, logo, rate card, payout statement and the week calendar. */
export const AR_UPGRADE: Record<string, string> = {
  // Navigation and bell
  'Messages': 'الرسائل', 'Your company': 'شركتك', '{n} unread': '{n} غير مقروءة',
  'New message from the publisher.': 'رسالة جديدة من الناشر.', 'New message from the buyer.': 'رسالة جديدة من المشتري.',
  // Conversation
  'Messages with {name}': 'الرسائل مع {name}', 'Everything stays on Nashr. Emails and phone numbers can’t be sent.': 'كل شيء يبقى على نشر. لا يمكن إرسال عناوين البريد الإلكتروني أو أرقام الهواتف.',
  'No messages yet. Ask about timing, the creative, or anything else about this booking.': 'لا رسائل بعد. اسأل عن التوقيت أو المادة الإعلانية أو أي شيء آخر يخص هذا الحجز.',
  'Your message': 'رسالتك', 'Write a message…': 'اكتب رسالة…', '{n} characters left': 'تبقّى {n} حرفًا', 'Enter to send · Shift+Enter for a new line': 'Enter للإرسال · Shift+Enter لسطر جديد',
  'This deal is finished, so the conversation is closed. It stays here as a record.': 'انتهت الصفقة، لذا أُغلقت المحادثة. تبقى هنا للرجوع إليها.',
  'Messages with the publisher open once you have paid': 'تُفتح الرسائل مع الناشر بعد أن تدفع', 'Messages with the buyer open once they have paid': 'تُفتح الرسائل مع المشتري بعد أن يدفع',
  'Until then, the booking brief carries everything the publisher needs. The conversation closes when the deal is finished.': 'حتى ذلك الحين، يتضمن ملخص الحجز كل ما يحتاجه الناشر. وتُغلق المحادثة عند انتهاء الصفقة.',
  'You': 'أنت', 'Flagged: may be moving off Nashr': 'مُعلَّمة: قد تنقل التواصل خارج نشر',
  // Messages page
  'Conversations with buyers about their bookings.': 'محادثاتك مع المشترين حول حجوزاتهم.', 'Conversations with publishers about your bookings.': 'محادثاتك مع الناشرين حول حجوزاتك.',
  'No conversations yet': 'لا محادثات بعد',
  'Once a buyer has paid for a booking, you can talk about it here until the deal is finished. Open a paid deal to start.': 'بعد أن يدفع المشتري ثمن الحجز، يمكنكما التحدث عنه هنا حتى انتهاء الصفقة. افتح صفقة مدفوعة للبدء.',
  'Each paid booking has its own conversation with the publisher, open until the deal is finished. Open a paid booking to ask about timing or the creative.': 'لكل حجز مدفوع محادثته الخاصة مع الناشر، مفتوحة حتى انتهاء الصفقة. افتح حجزًا مدفوعًا لتسأل عن التوقيت أو المادة الإعلانية.',
  'Go to deals': 'الذهاب إلى الصفقات', 'Go to bookings': 'الذهاب إلى الحجوزات', 'Conversations': 'المحادثات', 'Search by company, outlet or order': 'ابحث بالشركة أو المنصة أو رقم الطلب',
  'Search conversations': 'ابحث في المحادثات', 'No conversations match.': 'لا محادثات مطابقة.', 'You:': 'أنت:', 'All conversations': 'كل المحادثات', 'Open deal': 'فتح الصفقة',
  'Open booking': 'فتح الحجز', 'This conversation is not available.': 'هذه المحادثة غير متاحة.', 'Choose a conversation.': 'اختر محادثة.',
  // Admin: messages on a deal
  '{n} flagged: wording that suggests moving the conversation off Nashr. Emails and phone numbers are always refused.': '{n} مُعلَّمة: صياغة توحي بنقل التواصل خارج نشر. أما عناوين البريد الإلكتروني وأرقام الهواتف فتُرفض دائمًا.',
  'No messages on this booking.': 'لا رسائل على هذا الحجز.',
  // Booking page
  'Withdraw request…': 'سحب الطلب…', 'Withdraw your buy-now request? The slot stays on sale, and you can bid or ask again.': 'سحب طلب الشراء الفوري؟ تبقى المساحة معروضة للبيع، ويمكنك المزايدة أو الطلب مجددًا.',
  'Request withdrawn.': 'سُحب الطلب.', 'Withdraw request': 'سحب الطلب', 'Keep the request': 'الإبقاء على الطلب', 'View order {ref}': 'عرض الطلب {ref}', 'Order, receipts and invoices': 'الطلب والإيصالات والفواتير',
  // Company page
  'TRN saved. It appears on tax invoices from now on.': 'حُفظ الرقم الضريبي. يظهر على الفواتير الضريبية من الآن.', 'TRN removed.': 'أُزيل الرقم الضريبي.',
  'Your company on Nashr: tax details and the people who book.': 'شركتك على نشر: البيانات الضريبية والأشخاص الذين يحجزون.', 'Tax details': 'البيانات الضريبية',
  'Publishers put your TRN on the tax invoices they send you, so you can reclaim the VAT. Leave it empty if your company is not VAT-registered.': 'يضع الناشرون رقمك الضريبي على الفواتير الضريبية التي يرسلونها إليك، لتتمكن من استرداد الضريبة. اتركه فارغًا إن لم تكن شركتك مسجلة في الضريبة.',
  '{n} of 15 digits': '{n} من 15 رقمًا', 'A TRN has 15 digits.': 'الرقم الضريبي من 15 رقمًا.', 'Undo': 'تراجع', 'Your team': 'فريقك', 'since {date}': 'منذ {date}',
  'To add a colleague, ask Nashr: everyone joins by invitation.': 'لإضافة زميل، تواصل مع نشر: الانضمام بالدعوة فقط.',
  // Bid panel
  'Your current maximum: {amount}': 'حدّك الأقصى الحالي: {amount}', '{amount} left': 'متبقٍ {amount}', 'If everything you lead or requested goes through': 'إذا تمّ كل ما تتصدره أو طلبته',
  'Nothing else you lead or requested yet': 'لا شيء آخر تتصدره أو طلبته بعد', 'Now': 'الآن', 'With this bid': 'مع هذه المزايدة',
  'Excluding VAT. Bids are binding, so plan within your budget.': 'دون الضريبة. المزايدات ملزمة، فخطّط ضمن ميزانيتك.',
  // Listings, editing, auto-accept
  'Accepts automatically at the reserve': 'يقبل تلقائيًا عند السعر الأدنى', 'Accept automatically at the reserve': 'القبول التلقائي عند السعر الأدنى',
  'When bidding closes at or above your reserve, the top bid is accepted for you and the buyer is asked to pay. Below the reserve, you still decide.': 'عند إغلاق المزايدة عند سعرك الأدنى أو أعلى منه، تُقبل أعلى مزايدة نيابة عنك ويُطلب من المشتري الدفع. وتحت السعر الأدنى يبقى القرار لك.',
  'Set a reserve price first.': 'حدّد السعر الأدنى أولًا.', 'Give the placement a name.': 'أعطِ المساحة الإعلانية اسمًا.', 'Set a price.': 'حدّد سعرًا.',
  'The reserve cannot be above the buy-now price.': 'لا يمكن أن يتجاوز السعر الأدنى سعر الشراء الفوري.',
  'Changes reach every future slot nobody has bid on, straight away. Slots with bids keep the terms their buyers bid on. To change days, times or breaks, add a new placement and archive this one.': 'تسري التغييرات فورًا على كل مساحة قادمة لم يزايد عليها أحد. وتحتفظ المساحات التي عليها مزايدات بالشروط التي زايد عليها المشترون. لتغيير الأيام أو الأوقات أو الفواصل، أضف مساحة جديدة وأرشف هذه.',
  'Saved. 1 future slot now has the new terms.': 'حُفظ. مساحة قادمة واحدة صارت بالشروط الجديدة.', 'Saved. {n} future slots now have the new terms.': 'حُفظ. {n} مساحات قادمة صارت بالشروط الجديدة.',
  'Back to listings': 'العودة إلى العروض', 'Save changes': 'حفظ التغييرات',
  // Logo and rate card
  'Use a JPEG or PNG image.': 'استخدم صورة JPEG أو PNG.', 'This image is {w}×{h} pixels. Use one at least {min} pixels on each side.': 'أبعاد هذه الصورة {w}×{h} بكسل. استخدم صورة لا يقل كل ضلع فيها عن {min} بكسل.',
  'The logo could not be uploaded.': 'تعذّر رفع الشعار.', 'Logo saved. Buyers see it now.': 'حُفظ الشعار. يراه المشترون الآن.', 'This image could not be read. Try another JPEG or PNG.': 'تعذّرت قراءة هذه الصورة. جرّب صورة JPEG أو PNG أخرى.',
  'The logo could not be removed.': 'تعذّرت إزالة الشعار.', 'Logo removed. Your initials show instead.': 'أُزيل الشعار. تظهر الأحرف الأولى بدلًا منه.', 'Logo': 'الشعار',
  'A square PNG or JPEG, at least {min} pixels. Transparent backgrounds stay transparent.': 'صورة مربعة PNG أو JPEG، بحد أدنى {min} بكسل. تبقى الخلفيات الشفافة شفافة.',
  'Replace logo': 'استبدال الشعار', 'Upload a logo': 'رفع شعار', 'Rate card': 'قائمة الأسعار', 'Not shared yet': 'لم تُشارَك بعد',
  'Rate card saved. Nashr uses it to set up your placements.': 'حُفظت قائمة الأسعار. تستخدمها نشر لإعداد مساحاتك الإعلانية.', 'Rate card removed.': 'أُزيلت قائمة الأسعار.',
  'Share your current rate card so Nashr can help set up your placements and prices. Only Nashr sees it.': 'شارك قائمة أسعارك الحالية لتساعدك نشر في إعداد مساحاتك وأسعارك. لا يراها إلا فريق نشر.',
  'Replace': 'استبدال', 'Uploading…': 'جارٍ الرفع…', 'Upload your rate card': 'ارفع قائمة أسعارك', 'PDF, spreadsheet or image': 'PDF أو جدول بيانات أو صورة',
  'You withdrew the request': 'سحبت الطلب', 'The buyer withdrew the request': 'سحب المشتري الطلب', 'withdraw': 'سحب الطلب',
  // Week calendar
  'Programme': 'البرامج', 'All day and packages': 'طوال اليوم والباقات',
  // Earnings and the payout statement
  'View statement': 'عرض الكشف', 'Back to earnings': 'العودة إلى الأرباح', 'Previous month': 'الشهر السابق', 'Next month': 'الشهر التالي', 'Payout statement': 'كشف التحويلات',
  'From {name}': 'من {name}', 'Summary': 'الملخص', 'Balance at the start': 'الرصيد في البداية', 'Released to you': 'حُرّرت لك', 'Balance at the end': 'الرصيد في النهاية',
  'Movements': 'الحركات', 'Nothing moved this month.': 'لا حركات هذا الشهر.', 'What': 'البيان', 'Change this month': 'التغيّر هذا الشهر', 'Deducted (refund costs)': 'مخصومة (تكاليف استرداد)',
  'Deducted this month: {amount}. These are card costs of refunds that were your responsibility.': 'المخصوم هذا الشهر: {amount}. وهي رسوم بطاقات لمبالغ مستردة كانت من مسؤوليتك.',
  'Amounts released are your price plus VAT, less Nashr’s commission. Nashr’s commission invoices and the tax invoices to buyers are separate documents. This statement is not a tax document.': 'المبالغ المحرّرة هي سعرك مضافًا إليه الضريبة، مخصومًا منه عمولة نشر. فواتير عمولة نشر والفواتير الضريبية للمشترين مستندات منفصلة. هذا الكشف ليس مستندًا ضريبيًا.',
}
