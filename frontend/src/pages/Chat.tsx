import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button, Avatar, Dropdown, Modal, Toast, Spin, TextArea, Tag, Form, List, Input } from '@douyinfe/semi-ui';
import { IconMoon, IconSun, IconSend, IconCopy, IconArrowUp, IconChevronDown } from '@douyinfe/semi-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import './Chat.css';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

interface Message {
  id: string;
  user_id: string;
  content: string;
  timestamp: string;
  recalled: boolean;
  original_content?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    avatar?: string;
    display_name?: string;
    role: 'Admin' | 'DeputyAdmin' | 'Member';
    muted_until?: string;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  display_name?: string;
  role: 'Admin' | 'DeputyAdmin' | 'Member';
  muted_until?: string;
}

interface MentionItem {
  messageId: string;
  from: string;
  content: string;
  timestamp: string;
}

interface MentionPosition {
  top?: number;
  bottom?: number;
  left: number;
}

const Chat: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customMuteModalVisible, setCustomMuteModalVisible] = useState(false);
  const [muteTargetUser, setMuteTargetUser] = useState<string>('');
  const [customMuteDuration, setCustomMuteDuration] = useState<number>(10);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState<MentionPosition>({ left: 0 });
  const [myMentions, setMyMentions] = useState<MentionItem[]>([]);
  const [showMentionAlert, setShowMentionAlert] = useState(false);
  const [checkedMentionIds, setCheckedMentionIds] = useState<Set<string>>(new Set());
  const [currentMentionIndex, setCurrentMentionIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [viewOriginalMessages, setViewOriginalMessages] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [tempDisplayName, setTempDisplayName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textAreaRef = useRef<any>(null);
  const lastScrollDirection = useRef<'up' | 'down'>('down');
  const lastScrollTop = useRef(0);

  useEffect(() => {
    // 全局禁用右键菜单
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    
    document.addEventListener('contextmenu', handleContextMenu);
    
    loadMessages();
    loadUsers();
    loadCurrentUser();
    loadMentionChecks();
    connectWebSocket();

    // 定期检查禁言状态
    const interval = setInterval(() => {
      loadCurrentUser();
    }, 10000); // 每10秒检查一次

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 检查新消息中是否有@我的
    if (user && messages.length > 0) {
      const mentions: MentionItem[] = [];
      const myDisplayName = currentUser?.display_name || user.username;
      
      messages.forEach(msg => {
        // 检查消息中是否包含@我（特殊格式或普通格式）
        const specialMentionRegex = new RegExp(`@\\[${user.id}:[^\\]]+\\]`, 'g');
        const normalMentionRegex1 = new RegExp(`@${myDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        const normalMentionRegex2 = new RegExp(`@${user.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        
        if (!msg.recalled && msg.user_id !== user.id && 
            (specialMentionRegex.test(msg.content) || 
             normalMentionRegex1.test(msg.content) || 
             normalMentionRegex2.test(msg.content))) {
          const messageUser = getUserInfo(msg.user_id);
          mentions.push({
            messageId: msg.id,
            from: getDisplayName(messageUser),
            content: msg.content,
            timestamp: msg.timestamp
          });
        }
      });
      
      setMyMentions(mentions);
      
      // 计算未查看的@消息
      const uncheckedMentions = mentions.filter(m => !checkedMentionIds.has(m.messageId));
      
      // 如果有未查看的@消息，显示提醒
      if (uncheckedMentions.length > 0) {
        setShowMentionAlert(true);
        // 重置索引为0，从第一条未查看的开始
        setCurrentMentionIndex(0);
      } else {
        setShowMentionAlert(false);
      }
    }
  }, [messages, user, currentUser, checkedMentionIds]);

  useEffect(() => {
    // 监听滚动事件
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const isAtBottom = scrollHeight - currentScrollTop - clientHeight < 50;

      // 判断滚动方向
      if (currentScrollTop < lastScrollTop.current) {
        lastScrollDirection.current = 'up';
      } else if (currentScrollTop > lastScrollTop.current) {
        lastScrollDirection.current = 'down';
      }
      lastScrollTop.current = currentScrollTop;

      // 如果用户先向上滚动，然后向下滚动，且不在底部，显示按钮
      if (lastScrollDirection.current === 'down' && !isAtBottom && currentScrollTop > 100) {
        setShowScrollToBottom(true);
      } else if (isAtBottom) {
        setShowScrollToBottom(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const loadMessages = async () => {
    try {
      const response = await axios.get('/api/messages');
      if (response.data.success) {
        setMessages(response.data.data);
      }
    } catch (error) {
      Toast.error('加载消息失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      // 非管理员无法获取用户列表，这是正常的
    }
  };

  const loadCurrentUser = async () => {
    try {
      const response = await axios.get('/api/current-user');
      if (response.data.success) {
        setCurrentUser(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load current user');
    }
  };

  const loadMentionChecks = async () => {
    try {
      const response = await axios.get('/api/mention-checks');
      if (response.data.success && response.data.data) {
        setCheckedMentionIds(new Set(response.data.data));
      }
    } catch (error) {
      console.error('Failed to load mention checks');
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.event) {
          case 'new_message':
            setMessages(prev => [...prev, data.data]);
            break;
          case 'message_recalled':
            setMessages(prev => prev.map(msg => 
              msg.id === data.data.message_id 
                ? { ...msg, recalled: true }
                : msg
            ));
            // 移除查看原消息的状态
            setViewOriginalMessages(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.data.message_id);
              return newSet;
            });
            break;
          case 'message_recalled_with_data':
            // 新增：处理带有完整数据的撤回消息
            setMessages(prev => prev.map(msg => 
              msg.id === data.data.id 
                ? data.data
                : msg
            ));
            // 移除查看原消息的状态
            setViewOriginalMessages(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.data.id);
              return newSet;
            });
            break;
          case 'user_banned':
            if (data.data.user_id === user?.id) {
              Toast.error('您已被封禁');
              logout();
            }
            break;
          case 'user_deleted':
            if (data.data.user_id === user?.id) {
              Toast.error('您的账号已被删除');
              logout();
            }
            break;
          case 'role_changed':
            // 重新加载用户列表和当前用户信息
            loadUsers();
            if (data.data.user_id === user?.id) {
              loadCurrentUser();
              // 如果是当前用户，显示提示
              if (data.data.new_role === 'DeputyAdmin') {
                Toast.success('您已被设为次管理员');
              } else if (data.data.old_role === 'DeputyAdmin' && data.data.new_role === 'Member') {
                Toast.info('您的次管理员权限已被取消');
              }
            }
            // 重新加载消息以更新角色标签
            loadMessages();
            break;
          case 'display_name_changed':
            // 重新加载消息和用户信息
            loadMessages();
            loadUsers();
            if (data.data.user_id === user?.id) {
              loadCurrentUser();
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // 尝试重连
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 3000);
    };

    wsRef.current = ws;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollToBottom(false);
  };

  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 高亮效果
      messageElement.classList.add('message-highlight');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight');
      }, 2000);
    }
  };

  const handleViewMentions = async () => {
    // 获取未查看的@消息
    const uncheckedMentions = myMentions.filter(m => !checkedMentionIds.has(m.messageId));
    
    if (uncheckedMentions.length > 0 && currentMentionIndex < uncheckedMentions.length) {
      // 获取当前要查看的@消息
      const currentMention = uncheckedMentions[currentMentionIndex];
      
      // 跳转到该消息
      scrollToMessage(currentMention.messageId);
      
      try {
        // 标记当前这条消息为已查看
        const response = await axios.post('/api/mark-mentions-checked', {
          message_ids: [currentMention.messageId]
        });
        
        if (response.data.success) {
          // 更新本地状态
          const newCheckedIds = new Set(checkedMentionIds);
          newCheckedIds.add(currentMention.messageId);
          setCheckedMentionIds(newCheckedIds);
          
          // 移动到下一条
          setCurrentMentionIndex(currentMentionIndex + 1);
          
          // 如果是最后一条，隐藏按钮
          if (currentMentionIndex + 1 >= uncheckedMentions.length) {
            setShowMentionAlert(false);
            setCurrentMentionIndex(0);
          }
        }
      } catch (error) {
        console.error('Failed to mark mention as checked');
      }
    }
  };

  // 处理消息内容，将@提及转换为特殊格式
  const processMessageContent = (content: string): string => {
    let processedContent = content;
    const allUsers = getAllUsers();
    
    // 匹配所有 @xxx 格式的内容
    const mentionRegex = /@([^\s@]+)/g;
    
    processedContent = processedContent.replace(mentionRegex, (match, mentionedName) => {
      // 查找匹配的用户（通过昵称或用户名）
      const matchedUser = allUsers.find(u => 
        (u.display_name && u.display_name === mentionedName) || 
        u.username === mentionedName
      );
      
      if (matchedUser) {
        // 转换为特殊格式 @[user_id:display_name]
        const displayName = getDisplayName(matchedUser);
        return `@[${matchedUser.id}:${displayName}]`;
      }
      
      return match;
    });
    
    return processedContent;
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    setSending(true);
    try {
      // 处理消息内容，将@提及转换为特殊格式
      const processedContent = processMessageContent(input);
      
      const response = await axios.post('/api/send-message', { content: processedContent });
      if (response.data.success) {
        setInput('');
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  const recallMessage = async (messageId: string) => {
    try {
      const response = await axios.post('/api/recall-message', { message_id: messageId });
      if (!response.data.success) {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('撤回失败');
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      Toast.success('已复制到剪贴板');
    }).catch(() => {
      Toast.error('复制失败');
    });
  };

  const handleUserAction = async (targetUserId: string, action: string) => {
    if (action === 'muteCustom') {
      setMuteTargetUser(targetUserId);
      setCustomMuteModalVisible(true);
      return;
    }

    try {
      let response;
      switch (action) {
        case 'setDeputy':
          response = await axios.post('/api/set-deputy-admin', { 
            user_id: targetUserId, 
            is_deputy: true 
          });
          break;
        case 'removeDeputy':
          response = await axios.post('/api/set-deputy-admin', { 
            user_id: targetUserId, 
            is_deputy: false 
          });
          break;
        case 'mute10':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 10 
          });
          break;
        case 'mute60':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 60 
          });
          break;
        case 'mute1440':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 1440 
          });
          break;
        case 'mute43200':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 43200 
          });
          break;
        case 'unmute':
          response = await axios.post('/api/unmute-user', { 
            user_id: targetUserId
          });
          break;
        case 'ban':
          Modal.confirm({
            title: '确认封禁',
            content: '确定要封禁该用户吗？封禁后用户将被删除且邮箱将被加入黑名单。',
            onOk: async () => {
              response = await axios.post('/api/ban-user', { user_id: targetUserId });
              if (response?.data.success) {
                Toast.success('用户已封禁');
                loadUsers();
                loadMessages();
              } else {
                Toast.error(response?.data.message || '操作失败');
              }
            },
          });
          return;
        case 'delete':
          Modal.confirm({
            title: '确认删除',
            content: '确定要删除该用户吗？',
            onOk: async () => {
              response = await axios.post('/api/delete-user', { user_id: targetUserId });
              if (response?.data.success) {
                Toast.success('用户已删除');
                loadUsers();
                loadMessages();
              } else {
                Toast.error(response?.data.message || '操作失败');
              }
            },
          });
          return;
      }

      if (response?.data.success) {
        Toast.success('操作成功');
        loadUsers();
        loadMessages();
        // 如果是禁言相关操作，重新加载当前用户信息
        if (action.startsWith('mute') || action === 'unmute') {
          setTimeout(() => loadCurrentUser(), 500);
        }
      } else {
        Toast.error(response?.data.message || '操作失败');
      }
    } catch (error) {
      Toast.error('操作失败');
    }
  };

  const handleCustomMute = async () => {
    try {
      const response = await axios.post('/api/mute-user', { 
        user_id: muteTargetUser, 
        duration_minutes: customMuteDuration 
      });
      
      if (response.data.success) {
        Toast.success('操作成功');
        setCustomMuteModalVisible(false);
        loadUsers();
        loadMessages();
        setTimeout(() => loadCurrentUser(), 500);
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('操作失败');
    }
  };

  const getUserInfo = (userId: string): User | null => {
    // 优先从users列表中查找
    const userFromList = users.find((u: User) => u.id === userId);
    if (userFromList) return userFromList;
    
    // 如果是当前用户
    if (currentUser?.id === userId) return currentUser;
    if (user?.id === userId) return user as User;
    
    // 从消息中查找用户信息
    const messageWithUser = messages.find((msg: Message) => msg.user_id === userId && msg.user);
    if (messageWithUser?.user) return messageWithUser.user as User;
    
    return null;
  };

  const getAllUsers = (): User[] => {
    const userMap = new Map<string, User>();
    
    // 添加users列表中的用户
    users.forEach(u => userMap.set(u.id, u));
    
    // 添加当前用户
    if (currentUser) userMap.set(currentUser.id, currentUser);
    if (user && !userMap.has(user.id)) userMap.set(user.id, user as User);
    
    // 从消息中提取用户
    messages.forEach(msg => {
      if (msg.user && !userMap.has(msg.user.id)) {
        userMap.set(msg.user.id, msg.user as User);
      }
    });
    
    return Array.from(userMap.values());
  };

  const getAvatar = (userInfo: User | null) => {
    if (userInfo?.avatar) {
      return (
        <Avatar 
          src={userInfo.avatar} 
          size="small"
          style={{ flexShrink: 0 }}
        />
      );
    }
    
    const name = userInfo?.username || '?';
    const firstChar = name[0].toUpperCase();
    const colors = [
      '--semi-color-primary',
      '--semi-color-success',
      '--semi-color-warning',
      '--semi-color-danger',
      '--semi-color-tertiary',
    ];
    const colorIndex = name.charCodeAt(0) % colors.length;
    
    return (
      <Avatar 
        size="small" 
        style={{ 
          backgroundColor: `var(${colors[colorIndex]})`,
          color: 'white',
          flexShrink: 0
        }}
      >
        {firstChar}
      </Avatar>
    );
  };

  const canManageUser = (targetUser: User | null) => {
    if (!user || !targetUser) return false;
    
    // 不能管理自己
    if (user.id === targetUser.id) return false;
    
    // 管理员可以管理所有人（除了自己）
    if (user.role === 'Admin') return true;
    
    // 次管理员只能管理普通成员
    if (user.role === 'DeputyAdmin' && targetUser.role === 'Member') return true;
    
    return false;
  };

  const canEditDisplayName = (targetUser: User | null) => {
    if (!user || !targetUser) return false;
    
    // 可以编辑自己的昵称
    if (user.id === targetUser.id) return true;
    
    // 管理员可以编辑次管理员和普通成员的昵称
    if (user.role === 'Admin' && (targetUser.role === 'DeputyAdmin' || targetUser.role === 'Member')) return true;
    
    // 次管理员可以编辑普通成员的昵称
    if (user.role === 'DeputyAdmin' && targetUser.role === 'Member') return true;
    
    return false;
  };

  const getMutedInfo = () => {
    if (!currentUser?.muted_until) return null;
    
    const mutedUntil = new Date(currentUser.muted_until);
    const now = new Date();
    
    if (mutedUntil <= now) return null;
    
    const diffMs = mutedUntil.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);
    
    if (diffMins > 60) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `您已被禁言，剩余时间：${hours}小时${mins}分钟`;
    }
    
    return `您已被禁言，剩余时间：${diffMins}分钟`;
  };

  const isMuted = () => {
    if (!currentUser?.muted_until) return false;
    return new Date(currentUser.muted_until) > new Date();
  };

  const isUserMuted = (targetUser: User | null) => {
    if (!targetUser?.muted_until) return false;
    return new Date(targetUser.muted_until) > new Date();
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    
    // 检测@符号
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      
      // 检查@后面是否有空格，如果有空格说明@已经完成
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt.toLowerCase());
        setShowMentionList(true);
        
        // 获取光标位置
        if (textAreaRef.current) {
          // 简单计算位置
          setMentionPosition({
            bottom: 50,
            left: 0
          });
        }
      } else {
        setShowMentionList(false);
      }
    } else {
      setShowMentionList(false);
    }
  };

  const handleSelectMention = (selectedUser: User) => {
    const lastAtIndex = input.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const beforeAt = input.substring(0, lastAtIndex);
      const afterAt = input.substring(lastAtIndex + 1);
      
      // 找到@后面的第一个空格或结尾
      const spaceIndex = afterAt.indexOf(' ');
      const restText = spaceIndex !== -1 ? afterAt.substring(spaceIndex) : '';
      
      // 使用显示名称而不是用户名
      const displayName = getDisplayName(selectedUser);
      setInput(`${beforeAt}@${displayName} ${restText}`);
      setShowMentionList(false);
      
      // 聚焦输入框
      if (textAreaRef.current) {
        textAreaRef.current.focus();
      }
    }
  };

  const getDisplayName = (userInfo: User | null): string => {
    if (!userInfo) return 'Unknown';
    return userInfo.display_name || userInfo.username;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleUpdateDisplayName = async (userId: string) => {
    try {
      const newDisplayName = tempDisplayName.trim() || null;
      const response = await axios.post('/api/update-user-display-name', {
        user_id: userId,
        display_name: newDisplayName
      });
      
      if (response.data.success) {
        Toast.success('昵称已更新');
        setEditingMessageId(null);
        loadCurrentUser();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('更新失败');
    }
  };

  const handleDeleteAccount = async () => {
    Modal.confirm({
      title: '确认注销账号',
      content: '您确定要注销账号吗？注销后所有数据将被删除且无法恢复。',
      onOk: () => {
        Modal.confirm({
          title: '再次确认',
          content: '请再次确认，您真的要注销账号吗？此操作不可撤销！',
          okType: 'danger',
          onOk: async () => {
            try {
              const response = await axios.post('/api/delete-account');
              if (response.data.success) {
                Toast.success('账号已注销');
                logout();
              } else {
                Toast.error(response.data.message);
              }
            } catch (error) {
              Toast.error('操作失败');
            }
          }
        });
      }
    });
  };

  const renderMessageContent = (content: string) => {
    // 先处理特殊格式的@提及，将其转换为当前昵称
    let processedContent = content;
    
    // 匹配 @[user_id:old_display_name] 格式
    const specialMentionRegex = /@\[([^:]+):([^\]]+)\]/g;
    processedContent = processedContent.replace(specialMentionRegex, (_match, userId, oldDisplayName) => {
      const user = getUserInfo(userId);
      if (user) {
        return `@${getDisplayName(user)}`;
      }
      // 如果用户不存在了，显示原来的昵称
      return `@${oldDisplayName}`;
    });
    
    // 检查是否包含HTML标签（排除Markdown链接）
    const htmlTagRegex = /<(?!https?:\/\/)[^>]+>/;
    const hasHtmlTags = htmlTagRegex.test(processedContent);
    
    if (hasHtmlTags) {
      // HTML模式：直接处理HTML内容
      // 处理@提及 - 匹配所有用户的昵称和用户名
      const allUsers = getAllUsers();
      allUsers.forEach(u => {
        const displayName = u.display_name || u.username;
        const username = u.username;
        
        // 替换@昵称
        const displayNameRegex = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        processedContent = processedContent.replace(displayNameRegex, `<span class="mention-highlight">@${displayName}</span>`);
        
        // 如果昵称和用户名不同，也替换@用户名
        if (displayName !== username) {
          const usernameRegex = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
          processedContent = processedContent.replace(usernameRegex, `<span class="mention-highlight">@${displayName}</span>`);
        }
      });
      
      // 清理HTML
      const config = {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                       'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
                       'font', 'center', 'hr', 'sub', 'sup', 'u', 's', 'del', 'ins', 'mark', 'small', 'big'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'id', 'target', 'rel', 'width', 'height', 'color', 'size', 'face', 'align'],
        ALLOWED_CLASSES: {
          'span': ['mention-highlight']
        },
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave']
      };
      
      const sanitizedContent = DOMPurify.sanitize(processedContent, config);
      
      return (
        <div 
          className="message-html-content"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      );
    } else {
      // Markdown模式
      return (
        <div className="message-html-content">
          <ReactMarkdown
            components={{
              p: ({ children }) => {
                const processChildren = (children: React.ReactNode): React.ReactNode => {
                  return React.Children.map(children, (child, index) => {
                    if (typeof child === 'string') {
                      // 处理@提及
                      const parts: React.ReactNode[] = [];
                      let lastIndex = 0;
                      const allUsers = getAllUsers();
                      
                      // 创建一个包含所有可能@的正则表达式
                      const mentionRegex = /@([^\s@]+)/g;
                      let match;
                      
                      while ((match = mentionRegex.exec(child)) !== null) {
                        const mentionedName = match[1];
                        
                        // 查找匹配的用户（通过昵称或用户名）
                        const matchedUser = allUsers.find(u => 
                          (u.display_name && u.display_name === mentionedName) || 
                          u.username === mentionedName
                        );
                        
                        if (matchedUser) {
                          // 添加@之前的文本
                          if (match.index > lastIndex) {
                            parts.push(child.substring(lastIndex, match.index));
                          }
                          
                          // 添加高亮的@提及（使用显示名称）
                          const displayName = getDisplayName(matchedUser);
                          parts.push(
                            <span key={`mention-${index}-${match.index}`} className="mention-highlight">
                              @{displayName}
                            </span>
                          );
                          
                          lastIndex = match.index + match[0].length;
                        }
                      }
                      
                      // 添加剩余的文本
                      if (lastIndex < child.length) {
                        parts.push(child.substring(lastIndex));
                      }
                      
                      return parts.length > 0 ? parts : child;
                    }
                    return child;
                  });
                };
                
                return <p style={{ margin: '4px 0' }}>{processChildren(children)}</p>;
              },
              strong: ({ children }) => {
                // 处理加粗文本中的@提及
                if (typeof children === 'string' && children.includes('@')) {
                  const parts: React.ReactNode[] = [];
                  let lastIndex = 0;
                  const allUsers = getAllUsers();
                  const mentionRegex = /@([^\s@]+)/g;
                  let match;
                  
                  while ((match = mentionRegex.exec(children)) !== null) {
                    const mentionedName = match[1];
                    const matchedUser = allUsers.find(u => 
                      (u.display_name && u.display_name === mentionedName) || 
                      u.username === mentionedName
                    );
                    
                    if (matchedUser) {
                      if (match.index > lastIndex) {
                        parts.push(children.substring(lastIndex, match.index));
                      }
                      
                      const displayName = getDisplayName(matchedUser);
                      parts.push(
                        <span key={`mention-${match.index}`} className="mention-highlight">
                          @{displayName}
                        </span>
                      );
                      
                      lastIndex = match.index + match[0].length;
                    }
                  }
                  
                  if (lastIndex < children.length) {
                    parts.push(children.substring(lastIndex));
                  }
                  
                  return <strong>{parts.length > 0 ? parts : children}</strong>;
                }
                return <strong>{children}</strong>;
              },
              em: ({ children }) => {
                // 处理斜体文本中的@提及
                if (typeof children === 'string' && children.includes('@')) {
                  const parts: React.ReactNode[] = [];
                  let lastIndex = 0;
                  const allUsers = getAllUsers();
                  const mentionRegex = /@([^\s@]+)/g;
                  let match;
                  
                  while ((match = mentionRegex.exec(children)) !== null) {
                    const mentionedName = match[1];
                    const matchedUser = allUsers.find(u => 
                      (u.display_name && u.display_name === mentionedName) || 
                      u.username === mentionedName
                    );
                    
                    if (matchedUser) {
                      if (match.index > lastIndex) {
                        parts.push(children.substring(lastIndex, match.index));
                      }
                      
                      const displayName = getDisplayName(matchedUser);
                      parts.push(
                        <span key={`mention-${match.index}`} className="mention-highlight">
                          @{displayName}
                        </span>
                      );
                      
                      lastIndex = match.index + match[0].length;
                    }
                  }
                  
                  if (lastIndex < children.length) {
                    parts.push(children.substring(lastIndex));
                  }
                  
                  return <em>{parts.length > 0 ? parts : children}</em>;
                }
                return <em>{children}</em>;
              },
              code: ({ children, className }) => {
                const text = String(children || '');
                const isCodeBlock = className && className.startsWith('language-');
                if (isCodeBlock) {
                  return <pre><code className={className}>{text}</code></pre>;
                }
                return <code>{text}</code>;
              },
              pre: ({ children }) => {
                return <pre style={{ margin: '8px 0' }}>{children}</pre>;
              },
              h1: ({ children }) => <h1 style={{ margin: '8px 0', fontSize: '1.5em' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ margin: '8px 0', fontSize: '1.3em' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ margin: '8px 0', fontSize: '1.1em' }}>{children}</h3>,
              h4: ({ children }) => <h4 style={{ margin: '8px 0' }}>{children}</h4>,
              h5: ({ children }) => <h5 style={{ margin: '8px 0' }}>{children}</h5>,
              h6: ({ children }) => <h6 style={{ margin: '8px 0' }}>{children}</h6>,
              ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote style={{ 
                  margin: '8px 0', 
                  paddingLeft: '12px', 
                  borderLeft: '3px solid var(--semi-color-border)',
                  color: 'var(--semi-color-text-2)'
                }}>
                  {children}
                </blockquote>
              ),
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      );
    }
  };

  const toggleViewOriginal = (messageId: string) => {
    setViewOriginalMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const filteredUsers = getAllUsers().filter(u => {
    if (u.id === user?.id) return false;
    const searchLower = mentionSearch.toLowerCase();
    const displayName = getDisplayName(u).toLowerCase();
    const username = u.username.toLowerCase();
    return displayName.startsWith(searchLower) || username.startsWith(searchLower);
  });

  // 计算未查看的@消息数量
  const uncheckedMentionsCount = myMentions.filter(m => !checkedMentionIds.has(m.messageId)).length;

  return (
    <Layout className="chat-layout">
      <Header className="chat-header">
        <div className="header-left">
          <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" className="header-logo" />
          <Title heading={4} style={{ margin: 0 }}>Cloud-PE 项目交流群</Title>
        </div>
        <div className="header-right">
          <Button
            theme="borderless"
            icon={theme === 'light' ? <IconMoon /> : <IconSun />}
            onClick={toggleTheme}
          />
          <Dropdown
            render={
              <Dropdown.Menu>
                <Dropdown.Item disabled style={{ cursor: 'default' }}>
                  <Text strong>{user?.username}</Text>
                </Dropdown.Item>
                <Dropdown.Divider />
                {user?.role === 'Admin' && (
                  <>
                    <Dropdown.Item onClick={() => window.open('/console', '_blank')}>
                      管理后台
                    </Dropdown.Item>
                  </>
                )}
                {user?.role !== 'Admin' && (
                  <>
                    <Dropdown.Item onClick={handleDeleteAccount}>注销账号</Dropdown.Item>
                  </>
                )}
                <Dropdown.Item onClick={logout}>退出登录</Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            {getAvatar(user)}
          </Dropdown>
        </div>
      </Header>

      <Content className="chat-content">
        <div className="messages-container" ref={messagesContainerRef}>
          {messages.map((message) => {
            const messageUser = getUserInfo(message.user_id);
            const isOwn = message.user_id === user?.id;
            const showOriginal = viewOriginalMessages.has(message.id);
            const isEditingThisMessage = editingMessageId === message.id;
            
            return (
              <div key={message.id} id={`message-${message.id}`} className={`message ${isOwn ? 'own' : ''}`}>
                <div className="message-header">
                  {canManageUser(messageUser) ? (
                    <Dropdown
                      trigger="contextMenu"
                      position="bottomLeft"
                      clickToHide={true}
                      render={
                        <Dropdown.Menu>
                          {/* 权限管理 */}
                          {user?.role === 'Admin' && messageUser && (
                            <>
                              {messageUser.role === 'Member' && (
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'setDeputy')}>
                                  设为次管理员
                                </Dropdown.Item>
                              )}
                              {messageUser.role === 'DeputyAdmin' && (
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'removeDeputy')}>
                                  取消次管理员
                                </Dropdown.Item>
                              )}
                            </>
                          )}
                          
                          {/* 禁言选项 */}
                          {messageUser && (
                            isUserMuted(messageUser) ? (
                              <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'unmute')}>
                                解除禁言
                              </Dropdown.Item>
                            ) : (
                              <>
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'mute10')}>
                                  禁言10分钟
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'mute60')}>
                                  禁言1小时
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'mute1440')}>
                                  禁言1天
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'mute43200')}>
                                  禁言30天
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => handleUserAction(messageUser.id, 'muteCustom')}>
                                  自定义时间
                                </Dropdown.Item>
                              </>
                            )
                          )}
                          
                          <Dropdown.Divider />
                          
                          {/* 危险操作 */}
                          {messageUser && (
                            <>
                              <Dropdown.Item type="danger" onClick={() => handleUserAction(messageUser.id, 'ban')}>
                                封禁
                              </Dropdown.Item>
                              {user?.role === 'Admin' && (
                                <Dropdown.Item type="danger" onClick={() => handleUserAction(messageUser.id, 'delete')}>
                                  删除用户
                                </Dropdown.Item>
                              )}
                            </>
                          )}
                        </Dropdown.Menu>
                      }
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {getAvatar(messageUser)}
                      </div>
                    </Dropdown>
                  ) : (
                    getAvatar(messageUser)
                  )}
                  {isEditingThisMessage ? (
                    <Input
                      size="small"
                      defaultValue={messageUser?.display_name || messageUser?.username}
                      style={{ width: 120, marginLeft: 8, marginRight: 8 }}
                      onChange={(value) => setTempDisplayName(value)}
                      onEnterPress={(e) => {
                        e.preventDefault();
                        handleUpdateDisplayName(messageUser?.id || '');
                      }}
                      onBlur={() => {
                        setEditingMessageId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <Text 
                      strong 
                      className="message-username"
                      onDoubleClick={() => {
                        if (canEditDisplayName(messageUser)) {
                          setEditingMessageId(message.id);
                          setTempDisplayName(messageUser?.display_name || messageUser?.username || '');
                        }
                      }}
                      style={{ cursor: canEditDisplayName(messageUser) ? 'pointer' : 'default' }}
                    >
                      {getDisplayName(messageUser)}
                    </Text>
                  )}
                  {messageUser?.role === 'Admin' && (
                    <Tag 
                      size="small"
                      style={{ backgroundColor: 'var(--admin-tag-background)', color: 'var(--admin-tag-color)', borderColor: 'var(--admin-tag-background)' }}
                    >管理员</Tag>
                  )}
                  {messageUser?.role === 'DeputyAdmin' && (
                    <Tag color="green" size="small">次管理员</Tag>
                  )}
                  {isUserMuted(messageUser) && (
                    <Tag color="grey" size="small">已禁言</Tag>
                  )}
                  <Text type="tertiary" size="small">
                    {new Date(message.timestamp).toLocaleString()}
                  </Text>
                </div>
                <Dropdown
                  trigger="contextMenu"
                  position="bottomLeft"
                  clickToHide={true}
                  render={
                    <Dropdown.Menu>
                      {/* 复制消息 */}
                      {(!message.recalled || (message.recalled && showOriginal && message.original_content)) && (
                        <Dropdown.Item 
                          icon={<IconCopy />}
                          onClick={() => copyMessage(showOriginal && message.original_content ? message.original_content : message.content)}
                        >
                          复制
                        </Dropdown.Item>
                      )}
                      
                      {/* 撤回消息选项 */}
                      {!message.recalled && (message.user_id === user?.id || 
                        (user?.role === 'Admin') ||
                        (user?.role === 'DeputyAdmin' && messageUser?.role !== 'Admin')) && (
                        <>
                          <Dropdown.Divider />
                          <Dropdown.Item onClick={() => recallMessage(message.id)}>
                            撤回
                          </Dropdown.Item>
                        </>
                      )}
                    </Dropdown.Menu>
                  }
                >
                  <div className="message-content">
                    {message.recalled ? (
                      user?.role === 'Admin' && message.original_content ? (
                        <Text type="tertiary" disabled>
                          原消息已被撤回{' '}
                          <span 
                            className="view-original-link"
                            onClick={() => toggleViewOriginal(message.id)}
                          >
                            {showOriginal ? '隐藏原消息' : '查看原消息'}
                          </span>
                        </Text>
                      ) : (
                        <Text type="tertiary" disabled>原消息已被撤回</Text>
                      )
                    ) : null}
                    {!message.recalled || (message.recalled && showOriginal && message.original_content) ? (
                      <div className="message-text">
                        {renderMessageContent(
                          showOriginal && message.original_content ? message.original_content : message.content
                        )}
                      </div>
                    ) : null}
                  </div>
                </Dropdown>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* 回到底部按钮 */}
        {showScrollToBottom && (
          <Button
            className="scroll-to-bottom-btn"
            icon={<IconChevronDown />}
            theme="solid"
            type="primary"
            onClick={scrollToBottom}
          />
        )}
      </Content>

      <Footer className="chat-footer">
        {showMentionAlert && uncheckedMentionsCount > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Button
              theme="light"
              icon={<IconArrowUp />}
              onClick={handleViewMentions}
              style={{ width: '100%' }}
            >
              看看你被谁@了 ({uncheckedMentionsCount}条)
            </Button>
          </div>
        )}
        <div className="input-container" style={{ position: 'relative' }}>
          <TextArea
            ref={textAreaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={getMutedInfo() || "输入消息... (支持HTML，Enter 发送，Shift+Enter 换行)"}
            disabled={sending || isMuted()}
            autosize={{ minRows: 1, maxRows: 4 }}
            style={{ minHeight: '40px' }}
          />
          {showMentionList && (
            <div className="mention-list" style={{
              position: 'absolute',
              bottom: mentionPosition.bottom || 50,
              left: mentionPosition.left || 0,
              background: 'var(--semi-color-bg-2)',
              border: '1px solid var(--semi-color-border)',
              borderRadius: 'var(--semi-border-radius-medium)',
              boxShadow: 'var(--semi-shadow-elevated)',
              maxHeight: 200,
              overflowY: 'auto',
              zIndex: 1000,
              minWidth: 200
            }}>
              <List
                dataSource={filteredUsers}
                renderItem={item => (
                  <List.Item
                    style={{ 
                      padding: '8px 12px', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                    onClick={() => handleSelectMention(item)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--semi-color-fill-0)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {getAvatar(item)}
                    <Text>{getDisplayName(item)}</Text>
                  </List.Item>
                )}
                emptyContent={<div style={{ padding: '8px 12px', color: 'var(--semi-color-text-2)' }}>没有找到用户</div>}
              />
            </div>
          )}
          <Button
            theme="solid"
            type="primary"
            icon={<IconSend />}
            onClick={sendMessage}
            loading={sending}
            disabled={!input.trim() || isMuted()}
            size="large"
            style={{ height: '40px' }}
          />
        </div>
        {getMutedInfo() && (
          <div style={{ padding: '8px 0', textAlign: 'center' }}>
            <Text type="danger">{getMutedInfo()}</Text>
          </div>
        )}
        <div className="footer-info">
          <Text type="tertiary" size="small">© 2025 Cloud-PE Team.</Text>
          <Text type="tertiary" size="small">
            <a 
              href="https://beian.miit.gov.cn/#/Integrated/index" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              鲁ICP备2023028944号
            </a>
          </Text>
        </div>
      </Footer>

      {/* 自定义禁言时间模态框 */}
      <Modal
        title="自定义禁言时间"
        visible={customMuteModalVisible}
        onCancel={() => setCustomMuteModalVisible(false)}
        onOk={handleCustomMute}
      >
        <Form>
          <Form.InputNumber
            field="duration"
            label="禁言时长（分钟）"
            initValue={customMuteDuration}
            onChange={(value) => setCustomMuteDuration(value as number)}
            min={1}
            max={43200}
            style={{ width: '100%' }}
          />
          <div style={{ marginTop: 8, color: 'var(--semi-color-text-2)' }}>
            <Text size="small">最少1分钟，最多30天（43200分钟）</Text>
            <br />
            <Text size="small">
              当前设置：
              {customMuteDuration >= 1440 
                ? `${Math.floor(customMuteDuration / 1440)}天${customMuteDuration % 1440 ? `${Math.floor((customMuteDuration % 1440) / 60)}小时${customMuteDuration % 60}分钟` : ''}`
                : customMuteDuration >= 60 
                  ? `${Math.floor(customMuteDuration / 60)}小时${customMuteDuration % 60 ? `${customMuteDuration % 60}分钟` : ''}`
                  : `${customMuteDuration}分钟`
              }
            </Text>
          </div>
        </Form>
      </Modal>
    </Layout>
  );
};

export default Chat;