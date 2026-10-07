import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { GlassBackdrop, Spinner } from '@/shared/components/ui';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { apiErrorMessage, cn } from '@/shared/lib';
import { useLoginMutation } from '../../authApi';
import { sessionReceived } from '../../authSlice';
import { BrandLogo, type LogoAsset } from '../../components/BrandLogo';
import { DEV_AUTO_LOGIN } from '../../devAuth';

const LoginSchema = z.object({
  email: z.email('Enter a valid email address').trim(),
  password: z.string().min(1, 'Enter your password'),
});
type LoginValues = z.infer<typeof LoginSchema>;

/**
 * Logos in public/logo/. To replace one, drop the new file there and update its name here; `crop`
 * trims the empty margin baked into each image (see BrandLogo). A missing file shows the name.
 */
const GROUP_LOGO: LogoAsset = { file: 'Ittehad-logo.png', name: 'Ittehad Automotive' };

/** The dealerships under Ittehad Automotive, all served by this one login. */
const DEALERSHIPS: LogoAsset[] = [
  { file: 'Hyundai-logo.png', name: 'Hyundai Islamabad', crop: 'inset(23% 10.5% 16.5% 10.5%)' },
  { file: 'jetour-logo.png', name: 'Jetour Ittehad', crop: 'inset(44% 5% 44% 5%)' },
  { file: 'CSM-Logo.png', name: 'CSM Ittehad', crop: 'inset(1.5% 0% 1.5% 0%)' },
];

/** The three dealership logos on one row (brand panel on larger screens, under the card on phones). */
function DealershipLogos({ className }: { className?: string }) {
  return (
    <ul className={cn('grid max-w-lg grid-cols-3 gap-2.5 sm:gap-3', className)} aria-label="Dealerships">
      {DEALERSHIPS.map((d) => (
        <li
          key={d.file}
          title={d.name}
          className="glass-soft flex h-14 min-w-0 items-center justify-center rounded-2xl px-3 short:h-12 sm:h-[4.5rem] sm:px-5 lg:short:h-14"
        >
          <BrandLogo logo={d} className="h-7 max-w-full short:h-6 sm:h-11 lg:short:h-9" />
        </li>
      ))}
    </ul>
  );
}

const inputClass = (invalid: boolean) =>
  cn(
    'glass-input h-12 w-full rounded-xl px-4 text-[15px] text-slate-900 placeholder:text-slate-500/70',
    'transition outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20',
    invalid && '!border-red-400',
  );

/**
 * Sign-in for every dealership under Ittehad Automotive. Glass ("liquid glass") surfaces float over a
 * soft, continuous backdrop of light; the styles live in index.css (.glass, .glass-soft, ...).
 */
export default function LoginPage() {
  const status = useAppSelector((s) => s.auth.status);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [login, { isLoading, error }] = useLoginMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const form = useForm<LoginValues>({ resolver: zodResolver(LoginSchema), defaultValues: { email: '', password: '' } });
  const errors = form.formState.errors;

  // Development auto sign-in: there is no login page; the app signs in by itself.
  if (status === 'authenticated' || DEV_AUTO_LOGIN) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const session = await login({ loginRequest: values }).unwrap();
      dispatch(sessionReceived(session));
      navigate(from, { replace: true });
    } catch {
      // Shown below from the mutation's error state.
    }
  });

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#cdd7e7]">
      {/* The same backdrop as the signed-in app, plus light behind the sign-in card (desktop). */}
      <GlassBackdrop />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        <div className="absolute top-1/2 right-[14%] size-[22rem] -translate-y-1/2 rounded-full bg-[#3f6fd6]/35 blur-3xl" />
        <div className="absolute top-[18%] right-[30%] size-[14rem] rounded-full bg-[#f2b58c]/30 blur-3xl" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ---- Brand panel ---- */}
        {/* Phones: a compact header so the sign-in form is visible without scrolling. */}
        <section className="flex items-center px-5 pt-6 pb-1 short:pt-4 sm:px-12 sm:pt-10 sm:pb-4 lg:px-16 lg:py-16 xl:px-24 lg:short:py-6">
          <div className="max-w-xl">
            <div className="mb-3 short:mb-2 sm:mb-8 lg:mb-14 lg:short:mb-6">
              <BrandLogo logo={GROUP_LOGO} className="h-11 short:h-9 sm:h-20 lg:short:h-14" />
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-[1.05] font-bold tracking-tight text-slate-900 short:text-2xl sm:text-6xl xl:text-7xl lg:short:text-5xl">
              Ittehad Automotive
            </h1>
            <p className="mt-1.5 text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase sm:mt-5 sm:text-sm sm:tracking-[0.18em] lg:short:mt-3">
              Dealership Management Platform
            </p>
            <p className="mt-5 hidden text-lg leading-relaxed text-slate-600 sm:block lg:short:mt-3 lg:short:text-base">
              One unified platform built for every dealership under Ittehad Automotive — connecting sales, service, parts and delivery across
              all three brands from a single, secure login.
            </p>
            <DealershipLogos className="mt-8 hidden sm:grid lg:mt-10 lg:short:mt-6" />
          </div>
        </section>

        {/* ---- Sign-in panel ---- */}
        <section className="flex flex-col items-center justify-center gap-5 px-4 pt-3 pb-8 short:gap-3 short:pt-2 short:pb-3 sm:px-8 sm:pt-4 sm:pb-12 lg:py-16 lg:short:py-6">
          <div className="glass relative w-full max-w-md overflow-hidden rounded-[28px] p-6 short:p-5 sm:p-10 lg:short:p-7">
            {/* Sheen: a soft sweep of light across the top of the glass. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -left-16 h-48 w-[140%] -rotate-6 bg-gradient-to-b from-white/50 to-transparent"
            />
            <div className="relative">
              <p className="text-xs font-semibold tracking-[0.2em] text-brand-700 uppercase">Sign in</p>
              <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-[28px] font-bold tracking-tight text-slate-900 short:text-2xl sm:mt-2 sm:text-4xl lg:short:text-3xl">
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 sm:mt-2 sm:text-[15px]">Enter your credentials to access your dashboard.</p>

              <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4 short:mt-4 short:space-y-3 sm:mt-8 sm:space-y-5 lg:short:mt-5 lg:short:space-y-4">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="name@dealership.com"
                    aria-invalid={!!errors.email}
                    className={inputClass(!!errors.email)}
                    {...form.register('email')}
                  />
                  {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      aria-invalid={!!errors.password}
                      className={cn(inputClass(!!errors.password), 'pr-12')}
                      {...form.register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
                        <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                        {showPassword && <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
                      </svg>
                    </button>
                  </div>
                  {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>}
                  <div className="mt-2.5 text-right">
                    <button type="button" onClick={() => setForgotOpen((v) => !v)} className="text-sm text-slate-600 hover:text-brand-700">
                      Forgot password?
                    </button>
                  </div>
                  {forgotOpen && (
                    <p className="glass-soft mt-2 rounded-lg px-3 py-2 text-sm text-brand-800" role="status">
                      Ask your Sales Manager or the system administrator to reset your password. You can then change it under My account.
                    </p>
                  )}
                </div>

                {error && (
                  <p className="rounded-lg border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm text-red-700" role="alert">
                    {apiErrorMessage(error)}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    'glass-button flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white',
                    'transition focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-70',
                  )}
                >
                  {isLoading && <Spinner className="size-4" />}
                  Log In
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-500 short:mt-3 sm:mt-8 lg:short:mt-4">Ittehad Automotive — internal use only</p>
            </div>
          </div>
          {/* Phones: the dealership logos sit below the sign-in card. */}
          <DealershipLogos className="w-full max-w-md sm:hidden" />
        </section>
      </div>
    </div>
  );
}
