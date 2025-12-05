import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardPanel } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { showToast } from '@/components/ui/toast';
import axios from 'axios';
import './Login.css';

interface PublicSettings {
  registration_open: boolean;
  require_approval: boolean;
}

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  avatar?: string;
  verification_code?: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const countdownTimerRef = useRef<number | null>(null);

  // Form field states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    avatar: '',
    verification_code: '',
  });

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    // 获取公开设置
    const fetchPublicSettings = async () => {
      try {
        const response = await axios.get('/api/public-settings');
        if (response.data.success) {
          const settings: PublicSettings = response.data.data;
          setRegistrationOpen(settings.registration_open);
          setRequireApproval(settings.require_approval);
          // 如果注册关闭了，确保用户在登录模式
          if (!settings.registration_open && isRegister) {
            setIsRegister(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch public settings');
      }
    };

    fetchPublicSettings();
  }, [isRegister]);

  useEffect(() => {
    // 倒计时逻辑
    if (countdown > 0) {
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdown]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (isRegisterMode: boolean): boolean => {
    const newErrors: FormErrors = {};

    if (isRegisterMode) {
      if (!formData.username.trim()) {
        newErrors.username = '请输入用户名';
      }
      if (!formData.verification_code.trim()) {
        newErrors.verification_code = '请输入验证码';
      }
    }

    if (!formData.email.trim()) {
      newErrors.email = '请输入邮箱';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }

    if (!formData.password.trim()) {
      newErrors.password = '请输入密码';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(false)) {
      return;
    }

    setLoading(true);
    const success = await login(formData.email, formData.password);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!registrationOpen) {
      showToast({
        title: '注册功能已关闭',
        type: 'error',
      });
      return;
    }

    if (!validateForm(true)) {
      return;
    }

    setLoading(true);
    const success = await register(formData);
    setLoading(false);
    if (success) {
      if (requireApproval && registrationOpen) {
        // 如果需要审核，显示提示
        showToast({
          title: '注册成功，请等待管理员审核',
          type: 'info',
        });
        setIsRegister(false);
      } else if (user) {
        navigate('/');
      }
    }
  };

  const sendVerificationCode = async () => {
    const email = formData.email;

    if (!email) {
      showToast({
        title: '请先输入邮箱',
        type: 'error',
      });
      return;
    }

    // 邮箱格式验证
    if (!validateEmail(email)) {
      showToast({
        title: '请输入有效的邮箱地址',
        type: 'error',
      });
      return;
    }

    setSendingCode(true);
    try {
      const response = await axios.post('/api/send-verification-code', { email });
      if (response.data.success) {
        showToast({
          title: '验证码已发送',
          type: 'success',
        });
        // 开始60秒倒计时
        setCountdown(60);
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        showToast({
          title: error.response.data.message,
          type: 'error',
        });
      } else {
        showToast({
          title: '发送失败',
          type: 'error',
        });
      }
    } finally {
      setSendingCode(false);
    }
  };

  const getCodeButtonText = () => {
    if (countdown > 0) {
      return `${countdown}s`;
    }
    return '发送验证码';
  };

  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const switchMode = (toRegister: boolean) => {
    setIsRegister(toRegister);
    setCountdown(0);
    setErrors({});
    setFormData({
      username: '',
      email: '',
      password: '',
      avatar: '',
      verification_code: '',
    });
  };

  return (
    <div className="login-container">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="theme-toggle"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
        }}
      >
        {theme === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </Button>

      <Card className="login-card">
        <CardPanel>
          <div className="login-header">
            <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" className="login-logo" />
            <h2 className="text-2xl font-semibold">Cloud-PE 项目交流群</h2>
          </div>

          {isRegister && registrationOpen ? (
            <Form
              onSubmit={handleRegister}
              className="login-form"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">
                    用户名 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="请输入用户名"
                    value={formData.username}
                    onChange={handleInputChange('username')}
                    aria-invalid={!!errors.username}
                  />
                  {errors.username && (
                    <p className="text-destructive text-sm mt-1">{errors.username}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    邮箱 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="请输入邮箱"
                    value={formData.email}
                    onChange={handleInputChange('email')}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-destructive text-sm mt-1">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    密码 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="请输入密码"
                    value={formData.password}
                    onChange={handleInputChange('password')}
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && (
                    <p className="text-destructive text-sm mt-1">{errors.password}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatar">头像链接</Label>
                  <Input
                    id="avatar"
                    type="text"
                    placeholder="请输入头像链接（选填）"
                    value={formData.avatar}
                    onChange={handleInputChange('avatar')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verification_code">
                    邮箱验证码 <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="verification_code"
                      type="text"
                      placeholder="请输入验证码"
                      value={formData.verification_code}
                      onChange={handleInputChange('verification_code')}
                      aria-invalid={!!errors.verification_code}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={countdown > 0 || sendingCode}
                      onClick={sendVerificationCode}
                      className="min-w-[100px]"
                    >
                      {sendingCode ? <Spinner /> : getCodeButtonText()}
                    </Button>
                  </div>
                  {errors.verification_code && (
                    <p className="text-destructive text-sm mt-1">{errors.verification_code}</p>
                  )}
                </div>

                {requireApproval && (
                  <div className="text-muted-foreground text-sm">
                    注：注册后需要管理员审核才能登录
                  </div>
                )}

                <Button
                  type="submit"
                  variant="default"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Spinner /> : '注册'}
                </Button>

                <div className="login-switch">
                  <span className="text-sm">已有账号？</span>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => switchMode(false)}
                    className="p-0 h-auto"
                  >
                    立即登录
                  </Button>
                </div>
              </div>
            </Form>
          ) : (
            <Form onSubmit={handleLogin} className="login-form">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">
                    邮箱 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="请输入邮箱"
                    value={formData.email}
                    onChange={handleInputChange('email')}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-destructive text-sm mt-1">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">
                    密码 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="请输入密码"
                    value={formData.password}
                    onChange={handleInputChange('password')}
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && (
                    <p className="text-destructive text-sm mt-1">{errors.password}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="default"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Spinner /> : '登录'}
                </Button>

                {registrationOpen && (
                  <div className="login-switch">
                    <span className="text-sm">没有账号？</span>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => switchMode(true)}
                      className="p-0 h-auto"
                    >
                      立即注册
                    </Button>
                  </div>
                )}

                {!registrationOpen && (
                  <div className="login-switch" style={{ marginTop: 16 }}>
                    <span className="text-muted-foreground text-sm">注册功能已关闭</span>
                  </div>
                )}
              </div>
            </Form>
          )}
        </CardPanel>
      </Card>

      <div className="login-footer">
        <span className="text-muted-foreground text-sm">© 2025 Cloud-PE Team.</span>
        <span className="text-muted-foreground text-sm">
          <a
            href="https://beian.miit.gov.cn/#/Integrated/index"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            鲁ICP备2023028944号
          </a>
        </span>
      </div>
    </div>
  );
};

export default Login;
