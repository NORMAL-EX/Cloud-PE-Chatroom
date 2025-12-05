import React, { useState, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose
} from '@/components/ui/alert-dialog';
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator
} from '@/components/ui/menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { UserPlus, Search, MoreHorizontal } from 'lucide-react';
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

interface FormData {
  username: string;
  email: string;
  password: string;
  avatar: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    username: '',
    email: '',
    password: '',
    avatar: ''
  });
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({});

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
      showToast({
        title: '加载用户列表失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Partial<FormData> = {};

    if (!formData.username.trim()) {
      errors.username = '请输入用户名';
    }

    if (!formData.email.trim()) {
      errors.email = '请输入邮箱';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    if (!formData.password) {
      errors.password = '请输入密码';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setAddLoading(true);
    try {
      const response = await axios.post('/api/add-user', formData);
      if (response.data.success) {
        showToast({
          title: '用户添加成功',
          type: 'success',
        });
        setAddModalVisible(false);
        setFormData({ username: '', email: '', password: '', avatar: '' });
        setFormErrors({});
        loadUsers();
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error) {
      showToast({
        title: '添加失败',
        type: 'error',
      });
    } finally{
      setAddLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await axios.post('/api/delete-user', { user_id: userId });
      if (response.data.success) {
        showToast({
          title: '用户已删除',
          type: 'success',
        });
        setDeleteDialogOpen(null);
        loadUsers();
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error) {
      showToast({
        title: '删除失败',
        type: 'error',
      });
    }
  };

  const handleSetDeputyAdmin = async (userId: string, isDeputy: boolean) => {
    try {
      const response = await axios.post('/api/set-deputy-admin', {
        user_id: userId,
        is_deputy: isDeputy
      });
      if (response.data.success) {
        showToast({
          title: isDeputy ? '已设为次管理员' : '已取消次管理员',
          type: 'success',
        });
        loadUsers();
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error) {
      showToast({
        title: '操作失败',
        type: 'error',
      });
    }
  };

  // 先过滤，再排序
  const filteredUsers = users
    .filter(user =>
      user.username.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      // 定义角色优先级
      const roleOrder = { 'Admin': 0, 'DeputyAdmin': 1, 'Member': 2 };

      // 按角色排序
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;

      // 如果角色相同，按注册时间排序（新的在前）
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 className="text-xl font-semibold">用户管理</h4>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户名或邮箱"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 240, paddingLeft: 36 }}
            />
          </div>
          <Dialog open={addModalVisible} onOpenChange={setAddModalVisible}>
            <DialogTrigger>
              <Button variant="default">
                <UserPlus className="w-4 h-4 mr-2" />
                添加用户
              </Button>
            </DialogTrigger>
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>添加用户</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddUser}>
                <div style={{ padding: '0 24px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <Label htmlFor="username">用户名</Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="请输入用户名"
                        style={{ marginTop: 8 }}
                      />
                      {formErrors.username && (
                        <p style={{ color: 'var(--destructive)', fontSize: '0.875rem', marginTop: 4 }}>
                          {formErrors.username}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="email">邮箱</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="请输入邮箱"
                        style={{ marginTop: 8 }}
                      />
                      {formErrors.email && (
                        <p style={{ color: 'var(--destructive)', fontSize: '0.875rem', marginTop: 4 }}>
                          {formErrors.email}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="password">密码</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="请输入密码"
                        style={{ marginTop: 8 }}
                      />
                      {formErrors.password && (
                        <p style={{ color: 'var(--destructive)', fontSize: '0.875rem', marginTop: 4 }}>
                          {formErrors.password}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="avatar">头像链接</Label>
                      <Input
                        id="avatar"
                        value={formData.avatar}
                        onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                        placeholder="请输入头像链接（选填）"
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose>
                    <Button variant="outline" type="button">
                      取消
                    </Button>
                  </DialogClose>
                  <Button
                    variant="default"
                    type="submit"
                    disabled={addLoading}
                  >
                    {addLoading && <Spinner className="mr-2" />}
                    添加
                  </Button>
                </DialogFooter>
              </form>
            </DialogPopup>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead>最近IP</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {user.username}
                    {user.role === 'Admin' && (
                      <Badge size="sm" style={{ backgroundColor: 'var(--admin-tag-background)', color: 'var(--admin-tag-color)', borderColor: 'var(--admin-tag-background)' }}>
                        管理员
                      </Badge>
                    )}
                    {user.role === 'DeputyAdmin' && (
                      <Badge variant="success" size="sm">次管理员</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.muted_until && new Date(user.muted_until) > new Date() ? (
                    <Badge variant="warning" size="sm">
                      禁言中 ({Math.ceil((new Date(user.muted_until).getTime() - Date.now()) / 1000 / 60)}分钟)
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">正常</Badge>
                  )}
                </TableCell>
                <TableCell>{new Date(user.created_at).toLocaleString()}</TableCell>
                <TableCell>{user.last_ips.length > 0 ? user.last_ips[user.last_ips.length - 1] : '无记录'}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {user.role !== 'Admin' && (
                      <Menu>
                        <MenuTrigger>
                          <Button
                            variant="ghost"
                            size="sm"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </MenuTrigger>
                        <MenuPopup align="end">
                          {user.role === 'Member' && (
                            <MenuItem onClick={() => handleSetDeputyAdmin(user.id, true)}>
                              设为次管理员
                            </MenuItem>
                          )}
                          {user.role === 'DeputyAdmin' && (
                            <MenuItem onClick={() => handleSetDeputyAdmin(user.id, false)}>
                              取消次管理员
                            </MenuItem>
                          )}
                          <MenuSeparator />
                          <AlertDialog open={deleteDialogOpen === user.id} onOpenChange={(open) => setDeleteDialogOpen(open ? user.id : null)}>
                            <AlertDialogTrigger>
                              <MenuItem variant="destructive">
                                删除用户
                              </MenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogPopup>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除</AlertDialogTitle>
                                <AlertDialogDescription>
                                  确定要删除用户 {user.username} 吗？
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogClose>
                                  <Button variant="outline">取消</Button>
                                </AlertDialogClose>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDeleteUser(user.id)}
                                >
                                  确认
                                </Button>
                              </AlertDialogFooter>
                            </AlertDialogPopup>
                          </AlertDialog>
                        </MenuPopup>
                      </Menu>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
};

export default UserManagement;
