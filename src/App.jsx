import { ThemeProvider, createTheme } from '@mui/material/styles';
import { HashRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes.jsx';
import AuthBoundary from './context/AuthContext.jsx';

const theme = createTheme({
  palette: {
    primary: { main: '#0f766e' },
    text: { primary: '#172b3a', secondary: '#64748b' },
    background: { default: '#f5f7fa', paper: '#ffffff' },
  },
  typography: { fontFamily: '"Segoe UI", sans-serif', button: { textTransform: 'none' } },
  shape: { borderRadius: 12 },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <HashRouter><AuthBoundary><AppRoutes /></AuthBoundary></HashRouter>
    </ThemeProvider>
  );
}
