import React, { useState, useEffect } from 'react';
import { CheckCircle as XCircle, Inbox } from 'lucide-react';
import { CheckCircle } from '@/components/icon/CheckCircle';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { toastManager } from '@/components/ui/toast';
import { AlertDialog, AlertDialogTrigger, AlertDialogPopup, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import axios from 'axios';

interface PendingUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  created_at: string;
}

const PendingUsers: React.FC = () => {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    loadPendingUsers();
  }, []);

  const loadPendingUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/pending-users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      toastManager.add({ title: '加载待审核用户失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const response = await axios.post('/api/approve-user', { user_id: userId });
      if (response.data.success) {
        toastManager.add({ title: '用户已通过审核', type: 'success' });
        loadPendingUsers();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
    setActionUserId(null);
    setActionType(null);
  };

  const handleReject = async (userId: string) => {
    try {
      const response = await axios.post('/api/reject-user', { user_id: userId });
      if (response.data.success) {
        toastManager.add({ title: '用户已拒绝', type: 'success' });
        loadPendingUsers();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
    setActionUserId(null);
    setActionType(null);
  };

  return (
    <>
      <div className="mb-4">
        <h4 className="text-xl font-semibold">待审核用户</h4>
      </div>
      
      {users.length === 0 && !loading ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Inbox className="h-12 w-12 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>暂无待审核用户</EmptyTitle>
            <EmptyDescription>所有注册申请都已处理完毕</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>头像</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((record) => (
                <tr key={record.id}>
                  <td>{record.username}</td>
                  <td>{record.email}</td>
                  <td>{record.avatar ? '已设置' : '未设置'}</td>
                  <td>{new Date(record.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <AlertDialog open={actionUserId === record.id && actionType === 'approve'} onOpenChange={(open) => !open && setActionUserId(null)}>
                        <AlertDialogTrigger render={
                          <Button
                            size="sm"
                            onClick={() => {
                              setActionUserId(record.id);
                              setActionType('approve');
                            }}
                          >
                            <CheckCircle size={16} className="mr-1" />
                            通过
                          </Button>
                        } />
                        <AlertDialogPopup>
                          <AlertDialogTitle>确认通过</AlertDialogTitle>
                          <AlertDialogDescription>确定要通过该用户的注册申请吗？</AlertDialogDescription>
                          <div className="flex justify-end gap-2 mt-4">
                            <AlertDialogCancel onClick={() => setActionUserId(null)}>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleApprove(record.id)}>确认</AlertDialogAction>
                          </div>
                        </AlertDialogPopup>
                      </AlertDialog>
                      
                      <AlertDialog open={actionUserId === record.id && actionType === 'reject'} onOpenChange={(open) => !open && setActionUserId(null)}>
                        <AlertDialogTrigger render={
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setActionUserId(record.id);
                              setActionType('reject');
                            }}
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            拒绝
                          </Button>
                        } />
                        <AlertDialogPopup>
                          <AlertDialogTitle>确认拒绝</AlertDialogTitle>
                          <AlertDialogDescription>确定要拒绝该用户的注册申请吗？该用户的邮箱将被加入黑名单。</AlertDialogDescription>
                          <div className="flex justify-end gap-2 mt-4">
                            <AlertDialogCancel onClick={() => setActionUserId(null)}>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleReject(record.id)}>确认</AlertDialogAction>
                          </div>
                        </AlertDialogPopup>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
};

export default PendingUsers;
