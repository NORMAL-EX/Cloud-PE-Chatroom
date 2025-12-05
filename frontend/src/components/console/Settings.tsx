import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { toastManager } from '@/components/ui/toast';
import axios from 'axios';

interface SystemSettings {
  registration_open: boolean;
  require_approval: boolean;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/settings');
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      toastManager.add({ title: '加载设置失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (field: keyof SystemSettings, value: boolean) => {
    if (!settings) return;
    
    const newSettings = { ...settings, [field]: value };
    setSettings(newSettings);
    
    if (field === 'registration_open' && !value && newSettings.require_approval) {
      newSettings.require_approval = false;
      setSettings(newSettings);
    }
    
    setSaving(true);
    try {
      const response = await axios.post('/api/update-settings', newSettings);
      if (response.data.success) {
        toastManager.add({ title: '设置已保存', type: 'success' });
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
        loadSettings();
      }
    } catch (error) {
      toastManager.add({ title: '保存失败', type: 'error' });
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h4 className="text-xl font-semibold">系统设置</h4>
      </div>
      
      {settings && (
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-medium">开放注册</Label>
              <div className="text-sm text-muted-foreground mt-1">
                关闭后，新用户将无法注册
              </div>
            </div>
            <Switch
              checked={settings.registration_open}
              onCheckedChange={(checked) => handleSettingChange('registration_open', checked)}
              disabled={saving}
            />
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-medium">注册需要审核</Label>
              <div className="text-sm text-muted-foreground mt-1">
                开启后，新用户注册后需要管理员审核才能登录
              </div>
            </div>
            <Switch
              checked={settings.require_approval}
              onCheckedChange={(checked) => handleSettingChange('require_approval', checked)}
              disabled={!settings.registration_open || saving}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;
