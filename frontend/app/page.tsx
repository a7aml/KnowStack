import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { landingFeatures, landingSteps } from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-20 text-center">
            <span className="inline-block rounded-full border border-border-strong bg-surface-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">
              Enterprise knowledge platform
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-5xl">
              A secure home for your organization&apos;s knowledge
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-text-muted">
              KnowStack lets organizations centralize internal documents and
              give employees grounded, cited answers — with strict
              per-tenant data isolation and full administrative control.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/admin/signup" size="lg">
                Set up your organization
              </Button>
              <Button href="/login" variant="outline" size="lg">
                Employee sign in
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">
              Built for organizations, not individuals
            </h2>
            <p className="mt-3 text-base text-text-muted">
              Every capability is designed around tenant boundaries, role
              separation, and administrative oversight.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {landingFeatures.map((feature) => (
              <Card key={feature.title}>
                <h3 className="text-base font-semibold text-navy-950">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="border-y border-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">
              How it works
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {landingSteps.map((step) => (
                <div key={step.step}>
                  <span className="text-sm font-semibold text-text-subtle">
                    {step.step}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-navy-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-lg border border-navy-900 bg-navy-950 px-8 py-12 text-center sm:px-16">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              Ready to bring your team&apos;s knowledge together?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-navy-200">
              Create an administrator account to configure your organization,
              or sign in if you already have access.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/admin/signup" variant="secondary" size="lg">
                Create admin account
              </Button>
              <Button href="/admin/login" variant="ghost" size="lg" className="text-white hover:bg-navy-900">
                Admin sign in
              </Button>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
