import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import LoginForm from '../components/auth/LoginForm'
import SignupForm from '../components/auth/SignupForm'
import { AUTH_HERO_IMAGE_URL } from '../components/auth/authImagePaths'
import '../styles/pages/auth-page.css'

/** ต้องตรงกับ --auth-swap-duration ใน AuthPage.css (0.65s) — navigate หลัง login/signup เลื่อนออก + ภูเขา */
const NAVIGATE_AT_MS = 650
const ENTER_ANIM_CLEAR_MS = 700

export default function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const timersRef = useRef<number[]>([])

  const openedAtSignupRef = useRef(location.pathname === '/signup')

  const pathSignup = location.pathname === '/signup'
  const hidePanels =
    location.pathname === '/forgot-hr-password' ||
    location.pathname === '/reset-hr-password' ||
    location.pathname === '/reset-employee-password' ||
    location.pathname === '/forgot-employee-password'
  const layout = pathSignup ? 'signup' : 'login'

  const [loginLeaving, setLoginLeaving] = useState(false)
  const [signupLeaving, setSignupLeaving] = useState(false)
  const [signupEnterAnim, setSignupEnterAnim] = useState(false)
  const [loginEnterAnim, setLoginEnterAnim] = useState(false)

  const pushTimer = useCallback((id: number) => {
    timersRef.current.push(id)
  }, [])

  useEffect(() => {
    return () => timersRef.current.forEach((id) => window.clearTimeout(id))
  }, [])

  /** หลัง navigate ไป /signup แล้ว ค่อยปล่อย loginLeaving + เริ่มแอนิเมชัน signup (กันฮีโร่กระโดดกลับ) */
  useEffect(() => {
    if (!pathSignup || !loginLeaving) return
    setLoginLeaving(false)
    if (!openedAtSignupRef.current) {
      setSignupEnterAnim(true)
      const tClear = window.setTimeout(() => setSignupEnterAnim(false), ENTER_ANIM_CLEAR_MS)
      pushTimer(tClear)
    }
  }, [pathSignup, loginLeaving, pushTimer])

  /** หลัง navigate ไป /login แล้ว ค่อยปล่อย signupLeaving + เริ่มแอนิเมชัน login */
  useEffect(() => {
    if (pathSignup || !signupLeaving) return
    setSignupLeaving(false)
    setLoginEnterAnim(true)
    const tClear = window.setTimeout(() => setLoginEnterAnim(false), ENTER_ANIM_CLEAR_MS)
    pushTimer(tClear)
  }, [pathSignup, signupLeaving, pushTimer])

  const goToSignupAnimated = useCallback(() => {
    if (pathSignup) return
    setLoginLeaving(true)
    const t1 = window.setTimeout(() => {
      navigate('/signup', { replace: true })
    }, NAVIGATE_AT_MS)
    pushTimer(t1)
  }, [navigate, pathSignup, pushTimer])

  const goToLoginAnimated = useCallback(() => {
    if (!pathSignup) return
    setSignupLeaving(true)
    const t1 = window.setTimeout(() => {
      navigate('/login', { replace: true })
    }, NAVIGATE_AT_MS)
    pushTimer(t1)
  }, [navigate, pathSignup, pushTimer])

  const rootClass = [
    'authRoot',
    hidePanels ? 'authRoot--hidePanels' : '',
    layout === 'signup' ? 'authRoot--layout-signup' : 'authRoot--layout-login',
    openedAtSignupRef.current && layout === 'signup' ? 'authRoot--initialSignup' : '',
    loginLeaving ? 'authRoot--loginLeaving' : '',
    signupLeaving ? 'authRoot--signupLeaving' : '',
    signupEnterAnim ? 'authRoot--signupEnterAnim' : '',
    loginEnterAnim ? 'authRoot--loginEnterAnim' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass}>
      <div
        className="authHero"
        style={{ backgroundImage: `url(${AUTH_HERO_IMAGE_URL})` }}
        aria-hidden="true"
      />

      <div className="authPanel authPanel--login">
        <div className="authPanelLoginInner">
          <div className="authCard">
            <div className="authCardHeader">
              <h1 className="authCardTitle">Log In Here</h1>
            </div>
            <LoginForm />

            <div className="loginBottomText">
              Don&apos;t have an account yet?{' '}
              <button type="button" onClick={goToSignupAnimated}>
                Sign up now!
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="authPanel authPanel--signup">
        <div className="authPanelSignupInner">
          <div className="authCard">
            <div className="authCardHeader">
              <h1 className="authCardTitle authCardTitle--signup">Sign Up Here</h1>
            </div>
            <SignupForm onRegistered={goToLoginAnimated} />

            <div className="signupBottomText">
              Already have an account?{' '}
              <button type="button" onClick={goToLoginAnimated}>
                Login
              </button>
            </div>
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  )
}
