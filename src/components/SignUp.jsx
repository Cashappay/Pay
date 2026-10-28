import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// Replace with your project's Supabase URL and Anon/Public Key.
// In a Vite or Next.js app, read these from import.meta.env or process.env:
// const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// ============================================================================
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Secure, modern Sign-Up Component built with React, Tailwind CSS, and Supabase Auth.
 * Includes real-time client validation, password visibility toggle, error banners,
 * and loading states.
 */
export default function SignUp({ onNavigateToLogin }) {
  // Form input state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  // Inline real-time validation error state
  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Email format validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Real-time client-side field validation logic
   */
  const validateField = (field, value) => {
    let errorMsg = '';

    if (field === 'fullName') {
      if (!value.trim()) {
        errorMsg = 'Full name is required.';
      } else if (value.trim().length < 2) {
        errorMsg = 'Full name must be at least 2 characters.';
      }
    }

    if (field === 'email') {
      if (!value.trim()) {
        errorMsg = 'Email address is required.';
      } else if (!emailRegex.test(value.trim())) {
        errorMsg = 'Please enter a valid email address.';
      }
    }

    if (field === 'password') {
      if (!value) {
        errorMsg = 'Password is required.';
      } else if (value.length < 8) {
        errorMsg = 'Password must be at least 8 characters long.';
      } else if (!/[A-Z]/.test(value)) {
        errorMsg = 'Must include at least one uppercase letter (A-Z).';
      } else if (!/[0-9]/.test(value)) {
        errorMsg = 'Must include at least one number (0-9).';
      } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
        errorMsg = 'Must include at least one special character (!@#$%...).';
      }
    }

    setErrors((prev) => ({ ...prev, [field]: errorMsg }));
    return errorMsg === '';
  };

  /**
   * Handle controlled input changes with instant validation feedback
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    validateField(name, value);
    if (serverError) setServerError(null);
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  /**
   * Supabase Auth Registration Handler
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    // Validate all fields before submission
    const isNameValid = validateField('fullName', formData.fullName);
    const isEmailValid = validateField('email', formData.email);
    const isPassValid = validateField('password', formData.password);

    if (!isNameValid || !isEmailValid || !isPassValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      // ------------------------------------------------------------------------
      // SUPABASE AUTHENTICATION INTEGRATION POINT
      // Calls supabase.auth.signUp with email, password, and user metadata
      // ------------------------------------------------------------------------
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      // Registration successful: clear inputs and display success confirmation
      setFormData({ fullName: '', email: '', password: '' });
      setSuccessMessage('Account created successfully! Please check your email to verify your account.');
    } catch (err) {
      // Display backend/API error banner above form
      setServerError(err.message || 'An unexpected error occurred during sign up.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4 py-12 selection:bg-[#00D632] selection:text-black">
      {/* Subtle Ambient Glow Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#00D632]/10 blur-[120px] rounded-full" />
      </div>

      {/* Centered Sign-Up Card */}
      <div className="relative w-full max-w-md bg-[#121212] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        
        {/* Header / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#00D632]/10 border border-[#00D632]/20 mb-4">
            <svg className="w-6 h-6 text-[#00D632]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Create an account</h2>
          <p className="text-xs text-neutral-400 mt-1.5">Sign up to get started in seconds</p>
        </div>

        {/* API Error Alert Banner */}
        {serverError && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2.5 text-rose-400 text-xs animate-fadeIn">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" />
            </svg>
            <span className="font-medium leading-relaxed">{serverError}</span>
          </div>
        )}

        {/* Success Confirmation Banner */}
        {successMessage && (
          <div className="mb-5 p-4 rounded-xl bg-[#00D632]/10 border border-[#00D632]/30 flex items-start space-x-2.5 text-[#00D632] text-xs animate-fadeIn">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium leading-relaxed">{successMessage}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          
          {/* 1. Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-xs font-bold text-neutral-300 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Natasha Torres"
              required
              className={`w-full bg-neutral-900 border rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 transition duration-150 focus:outline-none ${
                errors.fullName
                  ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                  : 'border-neutral-700 focus:border-[#00D632] focus:ring-2 focus:ring-[#00D632]/20'
              }`}
            />
            {errors.fullName && (
              <p className="text-[11px] text-rose-400 mt-1 font-medium flex items-center space-x-1">
                <span>•</span>
                <span>{errors.fullName}</span>
              </p>
            )}
          </div>

          {/* 2. Email Address */}
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-neutral-300 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="you@example.com"
              required
              className={`w-full bg-neutral-900 border rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 transition duration-150 focus:outline-none ${
                errors.email
                  ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                  : 'border-neutral-700 focus:border-[#00D632] focus:ring-2 focus:ring-[#00D632]/20'
              }`}
            />
            {errors.email && (
              <p className="text-[11px] text-rose-400 mt-1 font-medium flex items-center space-x-1">
                <span>•</span>
                <span>{errors.email}</span>
              </p>
            )}
          </div>

          {/* 3. Password with Show/Hide Toggle */}
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-neutral-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="At least 8 characters"
                required
                className={`w-full bg-neutral-900 border rounded-xl pl-4 pr-11 py-2.5 text-xs text-white placeholder-neutral-500 transition duration-150 focus:outline-none ${
                  errors.password
                    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-neutral-700 focus:border-[#00D632] focus:ring-2 focus:ring-[#00D632]/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition focus:outline-none"
              >
                {showPassword ? (
                  /* Eye Slash Icon (Hide) */
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  /* Eye Icon (Show) */
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="text-[11px] text-rose-400 mt-1 font-medium flex items-center space-x-1">
                <span>•</span>
                <span>{errors.password}</span>
              </p>
            ) : (
              <p className="text-[10px] text-neutral-500 mt-1">
                Must be 8+ chars with 1 uppercase, 1 number, and 1 special symbol.
              </p>
            )}
          </div>

          {/* Prominent Full-Width Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#00D632] hover:bg-[#00c02d] text-black font-black py-3.5 rounded-xl text-xs sm:text-sm transition duration-150 shadow-lg shadow-emerald-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mt-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4 text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>

          {/* Bottom Switch to Login Link */}
          <div className="pt-4 border-t border-neutral-800 text-center">
            <p className="text-xs text-neutral-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="text-[#00D632] font-bold hover:underline ml-1 focus:outline-none"
              >
                Log in
              </button>
            </p>
          </div>

        </form>
      </div>
    </div>
  );
}

