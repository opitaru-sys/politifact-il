import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "אודות | בדוק",
  description: "מי אנחנו, איך אנחנו בודקים עובדות, ולמה החלטנו שזה חשוב",
};

export default function AboutPage() {
  return (
    <article className="prose prose-sm max-w-2xl mx-auto" dir="rtl">
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">אודות</div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">בדוק<span className="text-accent">.</span></h1>
      <p className="text-foreground-muted mb-8 leading-relaxed">
        בדיקת עובדות לפוליטיקאים ישראליים. בלתי תלוי, ללא שיוך פוליטי.
      </p>

      {/* Funding/affiliation disclosure — trust signal must be prominent */}
      <div
        className="not-prose mb-10 px-5 py-4 border-[1.5px] border-border-strong"
        style={{ borderRadius: 4, backgroundColor: "var(--card)" }}
      >
        <div className="text-[11px] tracking-[0.25em] uppercase text-accent font-bold mb-2">
          גילוי נאות
        </div>
        <p className="text-sm leading-relaxed">
          <strong className="text-foreground">בדוק אינו ממומן.</strong>{" "}
          אין לאתר גורם מממן, תרומות, פרסומות, נותני חסות, מפלגות, אינטרסים זרים, או צוות בשכר. זהו פרויקט אישי של אדם אחד.
          הקוד פתוח. אם מצאתם השפעה חיצונית על מה שמתפרסם, דווחו.
        </p>
      </div>

      <Section title="מה אנחנו עושים">
        אנחנו אוספים טענות פומביות של פוליטיקאים ישראליים, ובודקים האם הן נכונות, חצי-נכונות או שגויות.
        כל טענה מקושרת למקור שבו נאמרה, וההסבר מציין את המקור הרשמי שעליו התבססה הבדיקה.
      </Section>

      <Section title="גישתנו לעדר העובדות">
        <ul className="list-disc pr-5 space-y-1.5">
          <li>אנו בודקים <strong>טענות עובדתיות בלבד</strong>. לא דעות, לא הבטחות עתידיות שאי-אפשר לאמת.</li>
          <li>אנו בודקים <strong>רק דברים שהפוליטיקאי אמר בעצמו</strong>. לא ניתוחים שעיתונאים כתבו עליו.</li>
          <li>כל בדיקה מקושרת ל<strong>מקור ציבורי בר-בדיקה</strong> (הלמ&quot;ס, בנק ישראל, פרוטוקולי כנסת וכד&apos;).</li>
        </ul>
      </Section>

      <Section title="ללא שיוך פוליטי">
        <p>
          אין לנו שיוך, מימון או אינטרס מאף מפלגה, גוף פוליטי או תורם. בודקים כל פוליטיקאי באותה מידה,
          באותו פרוטוקול, באותם כלים.
        </p>
        <p>
          אנחנו לא חושבים שמישהו &ldquo;צריך להפסיד&rdquo; או &ldquo;צריך לנצח&rdquo;. אנחנו רק רוצים שאזרחים יוכלו לדעת
          אם המידע שמגיע אליהם נכון.
        </p>
      </Section>

      <Section title="איך זה עובד">
        <ol className="list-decimal pr-5 space-y-1.5">
          <li>מערכת אוטומטית סורקת מקורות חדשותיים ופרוטוקולי כנסת פעם ביום ומחפשת ציטוטים של פוליטיקאים.</li>
          <li>מודל בינה מלאכותית מחלץ את הטענות העובדתיות הניתנות לאימות.</li>
          <li>מודל נוסף נותן פסק דין על כל טענה (אמת / חצי אמת / שקר) ומציין את המקור.</li>
          <li>
            <strong>בדיקה כפולה:</strong> מודל AI שלישי, אדוורסרי וספקני, בוחן את הבדיקה הראשונה
            לפי 5 קריטריונים: תקפות פסק הדין, תמיכת ההסבר, ניטרליות פוליטית, מהימנות המקור, והתאמה לציטוט המקורי.
            רק טענות שעוברות את הבדיקה הזו מקבלות את התווית{" "}
            <span
              className="not-prose inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold border align-middle"
              style={{
                borderColor: "var(--verdict-true)",
                color: "var(--verdict-true)",
                backgroundColor: "var(--verdict-true-bg)",
                borderRadius: 2,
              }}
            >
              ✓ בדיקה כפולה
            </span>
            . טענות שטרם עברו מסומנות "טרם אומת" ומתפרסמות אך תחת הסתייגות.
          </li>
          <li>הציבור יכול לדווח על שגיאות ולהוסיף הקשר בתגובות לכל טענה.</li>
        </ol>
      </Section>

      <Section title="מגבלות שצריך לדעת">
        <ul className="list-disc pr-5 space-y-1.5">
          <li>הבדיקה נעשית על ידי AI ועלולה להכיל שגיאות. תמיד בדקו את המקורות בעצמכם.</li>
          <li>חלק מהציטוטים שנמצאים בחדשות הם פרפרזות של מה שהפוליטיקאי אמר, לא תמלולים מדויקים.</li>
          <li>נושאים שנויים במחלוקת לעיתים מקבלים פסק דין &ldquo;חצי-אמת&rdquo;. לא מתוך נוחיות אלא כי האמת אכן חלקית.</li>
          <li>הבטחות לגבי העתיד לא מקבלות פסק דין, כי אי-אפשר עדיין לאמת אותן.</li>
        </ul>
      </Section>

      <Section title="מי בנה את האתר">
        <p>
          האתר נבנה על ידי <a href="https://www.linkedin.com/in/omripitaru/" target="_blank" rel="noopener noreferrer" className="underline">Omri Pitaru</a>
          {" "}כפרויקט אישי. הקוד פתוח ושקוף. אם יש לכם הצעות, באגים או שיפורים, מוזמנים לפנות.
        </p>
      </Section>

      <Section title="מצאתם שגיאה?">
        <p>
          לכל טענה יש כפתור &ldquo;דיווח על שגיאה&rdquo;. הדיווחים נשמרים, נבדקים ידנית, והטענות מתוקנות במידת הצורך.
          אפשר גם להגיב על כל טענה ולהוסיף הקשר, מקור, או תיקון.
        </p>
      </Section>

      <Section title="תיקונים והסרות (Takedown)">
        <p id="takedown">
          האתר בגרסת בטא. הוא מתפרסם כדי לקבל משוב מהציבור, מעיתונאים ומהפוליטיקאים עצמם.
        </p>
        <p>
          <strong>אם אתם פוליטיקאים, נציגי לשכה או דוברים</strong> ומצאתם טענה המיוחסת לכם
          שלדעתכם לא מדויקת, לא נאמרה כפי שצוטטה, או מציגה את עמדתכם באופן מטעה — ניצור איתכם
          קשר תוך 48 שעות מקבלת הפנייה.
        </p>
        <p>
          <strong>נוהל הפנייה:</strong>
        </p>
        <ul className="list-disc pr-5 space-y-1.5">
          <li>
            <strong>הדרך הפשוטה:</strong> לחצו על כפתור <em>&ldquo;דיווח על שגיאה&rdquo;</em> בעמוד של הטענה הספציפית.
            הפנייה תגיע אליי ישירות עם הציטוט והפסק שמופיעים באתר.
          </li>
          <li>
            <strong>פנייה כללית, ייעוץ או משפטית:</strong> שלחו הודעה ב-
            <a
              href="https://www.linkedin.com/in/omripitaru/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >LinkedIn</a>.
            אני לא מפרסם כתובת אימייל כדי להימנע מספאם.
          </li>
        </ul>
        <p>
          בכל פנייה, הקפידו לכלול: קישור לטענה הספציפית, תיאור הבעיה (ציטוט לא מדויק, פסק דין שגוי,
          הקשר חסר, או פגיעה בשם הטוב), וכן מקור רשמי או ראיה התומכים בעמדתכם — לא חובה, אבל מזרז את הבדיקה.
        </p>
        <p>
          <strong>מה יקרה:</strong> במידת הצורך הטענה תוסר מיידית עד לבדיקה נוספת. אם הבדיקה
          תמצא שהדיווח מוצדק, הטענה תתוקן או תוסר לצמיתות. כל הסרה תתועד פומבית בעמוד &quot;תיקונים&quot; בהמשך.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
