import React, { useState, useEffect } from 'react';
import { UserPlus, Search, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { toastManager } from '@/components/ui/toast';
import axios from 'axios';

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'Admin' | 'DeputyAdmin' | 'Member';
  status: 'Active' | 'Pending' | 'Banned';
  created_at: string;
  last_ips: string[];
  muted_until?: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    avatar: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      toastManager.add({ title: '加载用户列表失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!formData.username || !formData.email || !formData.password) {
      toastManager.add({ title: '请填写所有必填字段', type: 'error' });
      return;
    }
    
    setAddLoading(true);
    try {
      const response = await axios.post('/api/add-user', formData);
      if (response.data.success) {
        toastManager.add({ title: '用户添加成功', type: 'success' });
        setAddModalVisible(false);
        setFormData({ username: '', email: '', password: '', avatar: '' });
        loadUsers();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '添加失败', type: 'error' });
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    
    try {
      const response = await axios.post('/api/delete-user', { user_id: userId });
      if (response.data.success) {
        toastManager.add({ title: '用户已删除', type: 'success' });
        loadUsers();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '删除失败', type: 'error' });
    }
  };

  const handleSetDeputyAdmin = async (userId: string, isDeputy: boolean) => {
    try {
      const response = await axios.post('/api/set-deputy-admin', { 
        user_id: userId,
        is_deputy: isDeputy 
      });
      if (response.data.success) {
        toastManager.add({ title: isDeputy ? '已设为次管理员' : '已取消次管理员', type: 'success' });
        loadUsers();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
  };

  const filteredUsers = users
    .filter(user => 
      user.username.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      const roleOrder = { 'Admin': 0, 'DeputyAdmin': 1, 'Member': 2 };
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-xl font-semibold">用户管理</h4>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户名或邮箱"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 w-60"
            />
          </div>
          <Button onClick={() => setAddModalVisible(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            添加用户
          </Button>
        </div>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>邮箱</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>最近IP</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((record) => (
              <tr key={record.id}>
                <td>
                  <div className="flex items-center gap-2">
                    {record.username}
                    {record.role === 'Admin' && <Badge className="admin-tag">管理员</Badge>}
                    {record.role === 'DeputyAdmin' && <Badge variant="secondary">次管理员</Badge>}
                  </div>
                </td>
                <td>{record.email}</td>
                <td>
                  {record.muted_until && new Date(record.muted_until) > new Date() ? (
                    <Badge variant="outline">禁言中</Badge>
                  ) : (
                    <Badge variant="secondary">正常</Badge>
                  )}
                </td>
                <td>{new Date(record.created_at).toLocaleString()}</td>
                <td>{record.last_ips.length > 0 ? record.last_ips[record.last_ips.length - 1] : '无记录'}</td>
                <td>
                  {record.role !== 'Admin' && (
                    <Menu>
                      <MenuTrigger render={
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      } />
                      <MenuPopup>
                        {record.role === 'Member' && (
                          <MenuItem onClick={() => handleSetDeputyAdmin(record.id, true)}>
                            设为次管理员
                          </MenuItem>
                        )}
                        {record.role === 'DeputyAdmin' && (
                          <MenuItem onClick={() => handleSetDeputyAdmin(record.id, false)}>
                            取消次管理员
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem onClick={() => handleDeleteUser(record.id)} className="text-destructive">
                          删除用户
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Dialog open={addModalVisible} onOpenChange={setAddModalVisible}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="请输入邮箱"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                required
              />
            </div>
            <div>
              <Label htmlFor="avatar">头像链接</Label>
              <Input
                id="avatar"
                value={formData.avatar}
                onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                placeholder="请输入头像链接（选填）"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleAddUser} disabled={addLoading}>
              {addLoading ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
};

export default UserManagement;
