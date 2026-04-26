import Link from 'next/link';

export default function Home() {
  const eventName = process.env.EVENT_NAME || 'Our Event';
  return (
    <div className="space-y-8">
      <header className="text-center space-y-2 pt-12">
        <h1 className="text-4xl font-bold">{eventName}</h1>
        <p className="text-slate-600">Accommodation coordination</p>
      </header>

      <div className="grid md:grid-cols-3 gap-4 pt-8">
        <Link
          href="/guest"
          className="block p-6 bg-white rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold mb-2">I need accommodation</h2>
          <p className="text-slate-600 text-sm">
            Fill out a short form with your dates and group size. We&apos;ll match you with a host.
          </p>
        </Link>

        <Link
          href="/host/signup"
          className="block p-6 bg-white rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold mb-2">I want to host</h2>
          <p className="text-slate-600 text-sm">
            Offer accommodation to event guests. A coordinator will review and confirm.
          </p>
        </Link>

        <Link
          href="/coordinator"
          className="block p-6 bg-white rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold mb-2">Coordinator login</h2>
          <p className="text-slate-600 text-sm">
            Admin dashboard for managing hosts, guests, and matches.
          </p>
        </Link>
      </div>

      <p className="text-center text-sm text-slate-500 pt-8">
        Existing hosts: check your email or text messages for your unique management link.
      </p>
      <p className="text-center text-xs text-slate-400">
        Prefer to request accommodation by phone? Call us — we&apos;ll capture your details over the call and text you a link to finish.
      </p>
    </div>
  );
}
