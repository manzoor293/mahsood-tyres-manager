import { useRef, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
} from "@mui/material";
import logo from "../assets/mahsood-tyres-logo.png";
import { catalogRequest } from "../utils/catalog.js";

function VisibilityIcon({ visible }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {visible && <path d="m3 3 18 18" />}
    </svg>
  );
}

export default function AuthPage({ setup, onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const normalized = email.trim().toLowerCase();
    const validation = {};
    if (
      normalized.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    )
      validation.email = "Enter a valid email address.";
    if (password.length < 8 || password.length > 1024)
      validation.password = "Use a password between 8 and 1024 characters.";
    if (setup && confirmation !== password)
      validation.confirmation = "Passwords do not match.";
    setErrors(validation);
    setError("");
    if (Object.keys(validation).length) return;
    pending.current = true;
    setBusy(true);
    try {
      await catalogRequest(() =>
        setup
          ? window.api.auth.setup({
              email: normalized,
              password,
              confirmPassword: confirmation,
            })
          : window.api.auth.login({ email: normalized, password }),
      );
      setPassword("");
      setConfirmation("");
      await onAuthenticated();
    } catch (failure) {
      setError(failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8">
      <Paper
        component="section"
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 460,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
        }}
        aria-labelledby="auth-title"
      >
        <div className="mb-7 text-center">
          <img
            src={logo}
            alt="Mahsood Tyres logo"
            className="mx-auto mb-4 h-24 w-40 object-contain"
          />
          <p className="text-xl font-semibold text-slate-900">Mahsood Tyres</p>
          <p className="mt-1 text-sm text-slate-500">Mahsood Tyre Manager</p>
        </div>
        <h1
          id="auth-title"
          className="text-2xl font-semibold tracking-tight text-slate-900"
        >
          {setup
            ? "Create Administrator Account"
            : "Sign in to Mahsood Tyre Manager"}
        </h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-slate-500">
          {setup
            ? "Set up the single local Administrator account for this shop. Your email is a sign-in identifier and is not verified online."
            : "Enter your local Administrator credentials to access your shop."}
        </p>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextField
            className="mb-3!"
            fullWidth
            required
            autoFocus
            label="Email"
            name="auth-email"
            type="email"
            autoComplete="username"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            error={Boolean(errors.email)}
            helperText={errors.email}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <TextField
            className="mb-3!"
            fullWidth
            required
            label="Password"
            name="auth-password"
            type={visible ? "text" : "password"}
            autoComplete={setup ? "new-password" : "current-password"}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            error={Boolean(errors.password)}
            helperText={
              errors.password || (setup ? "At least 8 characters." : "")
            }
            slotProps={{
              htmlInput: { maxLength: 1024 },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      disabled={busy}
                      aria-label={visible ? "Hide password" : "Show password"}
                      onClick={() => setVisible((value) => !value)}
                      edge="end"
                    >
                      <VisibilityIcon visible={visible} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {setup && (
            <TextField
              className="mb-3!"
              fullWidth
              required
              label="Confirm Password"
              name="auth-confirm-password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={confirmation}
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
              error={Boolean(errors.confirmation)}
              helperText={errors.confirmation}
              slotProps={{ htmlInput: { maxLength: 1024 } }}
            />
          )}
          <Button
            fullWidth
            size="large"
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={
              busy ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {busy
              ? "Please wait..."
              : setup
                ? "Create Administrator Account"
                : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Offline access. Credentials stay on this device. Forgotten-password
          recovery is not available in this release.
        </p>
      </Paper>
    </main>
  );
}
