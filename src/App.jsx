import React, { useEffect, useState } from 'react';
import { Layout, Row, Col, Table, Button, Modal, List, DatePicker, Space, Spin, message, Card } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';
import dayjs from 'dayjs';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;

function App() {
  const [metrics, setMetrics] = useState({
    totalMessages: 0,
    totalDialogs: 0,
    avgDialogLength: 0,
    retentionRate: '0%',
    successRate: '0%',
    failRate: '0%',
    conversion: '0%',
  });
  const [chartData, setChartData] = useState([]);
  const [users, setUsers] = useState([]);
  const [chatLogs, setChatLogs] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [dateRange, setDateRange] = useState([null, null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      
      try {
        const { data: logs, error } = await supabase.from('chat_logs').select('*');
        
        if (error || !logs) {
          console.error('Ошибка Supabase:', error);
          setError('Ошибка загрузки данных из Supabase');
          setLoading(false);
          return;
        }

        if (!logs || logs.length === 0) {
          console.log('Нет данных');
          setLoading(false);
          return;
        }

        console.log('Загружено записей:', logs.length);

        // Расчёт метрик
        const totalMessages = logs.length;
        const validLogs = logs.filter(l => l.session_id && l.user_id);
        const sessions = Array.from(new Set(validLogs.map(l => l.session_id)));
        const totalDialogs = sessions.length;

        // СРЕДНЯЯ ДЛИНА ДИАЛОГА (в сообщениях)
        const sessionLengths = sessions.map(
          sessionId => validLogs.filter(l => l.session_id === sessionId).length
        );
        const avgDialogLength = sessionLengths.length
          ? (sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length).toFixed(1)
          : 0;

        // ВОЗВРАЩАЕМОСТЬ ПО ДНЯМ
        const userDays = {};
        validLogs.forEach(l => {
          if (l.created_at && l.user_id) {
            const date = dayjs(l.created_at).format('YYYY-MM-DD');
            if (!userDays[l.user_id]) userDays[l.user_id] = new Set();
            userDays[l.user_id].add(date);
          }
        });
        
        const totalUsers = Object.keys(userDays).length;
        const returningUsers = Object.values(userDays).filter(days => days.size > 1).length;
        const retentionRate = totalUsers > 0 
          ? `${Math.round((returningUsers / totalUsers) * 100)}%`
          : '0%';

        // УСПЕШНОСТЬ ДИАЛОГОВ - НОВЫЙ КРИТЕРИЙ!
        // Ищем только сообщения ПОЛЬЗОВАТЕЛЕЙ с контактами
        const successDialogs = sessions.filter(sessionId => {
          const sessionMessages = validLogs.filter(l => l.session_id === sessionId);
          
          // Проверяем только сообщения пользователей (role === 'user')
          const userMessages = sessionMessages.filter(l => l.role === 'user');
          
          return userMessages.some(l => {
            if (!l.content) return false;
            
            const content = l.content.toLowerCase();
            
            // Паттерны для поиска контактов
            const phonePattern = /(\+7|8)[\s\-\(\)]?[\d\s\-\(\)]{10,}/; // Телефоны
            const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/; // Email
            const telegramPattern = /@[a-zA-Z0-9_]+/; // Telegram username
            
            // Ключевые фразы от пользователя
            const contactKeywords = /мой телефон|мой номер|можете звонить|вот мой контакт|моя почта|мой email|записывайте/i;
            
            return phonePattern.test(content) || 
                   emailPattern.test(content) || 
                   telegramPattern.test(content) ||
                   contactKeywords.test(content);
          });
        }).length;

        const failDialogs = totalDialogs - successDialogs;
        const successRate = totalDialogs ? `${Math.round((successDialogs / totalDialogs) * 100)}%` : '0%';
        const failRate = totalDialogs ? `${Math.round((failDialogs / totalDialogs) * 100)}%` : '0%';

        console.log('=== АНАЛИЗ УСПЕШНОСТИ ===');
        console.log('Всего диалогов:', totalDialogs);
        console.log('Успешных диалогов:', successDialogs);
        console.log('Процент успешности:', successRate);
        
        // Детальный анализ каждого диалога
        sessions.forEach(sessionId => {
          const sessionMessages = validLogs.filter(l => l.session_id === sessionId);
          const userMessages = sessionMessages.filter(l => l.role === 'user');
          const hasContacts = userMessages.some(l => {
            if (!l.content) return false;
            const content = l.content.toLowerCase();
            const phonePattern = /(\+7|8)[\s\-\(\)]?[\d\s\-\(\)]{10,}/;
            const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const telegramPattern = /@[a-zA-Z0-9_]+/;
            const contactKeywords = /мой телефон|мой номер|можете звонить|вот мой контакт|моя почта|мой email|записывайте/i;
            
            return phonePattern.test(content) || emailPattern.test(content) || 
                   telegramPattern.test(content) || contactKeywords.test(content);
          });
          
          if (hasContacts) {
            console.log(`✅ Успешный диалог ${sessionId}:`, 
              userMessages.filter(l => l.content).map(l => l.content.substring(0, 50))
            );
          }
        });

        // График
        const chartMap = {};
        validLogs.forEach(l => {
          if (l.created_at) {
            const date = dayjs(l.created_at).format('YYYY-MM-DD');
            if (!chartMap[date]) chartMap[date] = 0;
            chartMap[date]++;
          }
        });
        let chartArr = Object.entries(chartMap).map(([date, messages]) => ({ date, messages }));

        if (dateRange[0] && dateRange[1]) {
          chartArr = chartArr.filter(item => {
            const d = dayjs(item.date);
            return d.isAfter(dateRange[0].subtract(1, 'day')) && d.isBefore(dateRange[1].add(1, 'day'));
          });
        }

        // Пользователи
        const userMap = {};
        validLogs.forEach(l => {
          if (!userMap[l.user_id]) {
            userMap[l.user_id] = {
              key: l.user_id,
              name: l.first_name || l.username || l.user_id,
              id: l.user_id,
            };
          }
        });
        const usersArr = Object.values(userMap);

        // Чаты
        const chatLogsMap = {};
        validLogs.forEach(l => {
          if (!chatLogsMap[l.user_id]) chatLogsMap[l.user_id] = [];
          chatLogsMap[l.user_id].push({
            from: l.role === 'user' ? 'user' : 'assistant',
            text: l.content || '',
            time: l.created_at,
          });
        });

        // ПРИНУДИТЕЛЬНО устанавливаем метрики
        const newMetrics = {
          totalMessages: totalMessages,
          totalDialogs: totalDialogs,
          avgDialogLength: avgDialogLength,
          retentionRate: retentionRate,
          successRate: successRate,
          failRate: failRate,
          conversion: successRate,
        };

        console.log('Рассчитанные метрики:', newMetrics);

        // Устанавливаем всё одновременно
        setMetrics(newMetrics);
        setChartData(chartArr);
        setUsers(usersArr);
        setChatLogs(chatLogsMap);
        setLoading(false);

      } catch (e) {
        console.error('Ошибка при обработке данных:', e);
        setLoading(false);
        setError('Ошибка соединения с сервером');
      }
    }
    
    fetchData();
  }, [dateRange]);

  const columns = [
    { title: 'Имя', dataIndex: 'name', key: 'name' },
    {
      title: 'Действия',
      key: 'actions',
      render: (_, record) => (
        <Button type="primary" size="small" onClick={() => setSelectedUser(record.id)}>
          История чата
        </Button>
      ),
    },
  ];

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: '#f0f2f5',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      {/* АДАПТИВНЫЙ КОНТЕЙНЕР */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Заголовок */}
        <div style={{ 
          background: '#1890ff', 
          color: '#fff', 
          fontSize: '24px',
          fontWeight: '700', 
          textAlign: 'center',
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
        }}>
          Дашборд Telegram-бота
        </div>

        {/* АДАПТИВНЫЕ МЕТРИКИ */}
        <div style={{
          background: '#fff',
          padding: '30px',
          marginBottom: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            textAlign: 'center', 
            marginBottom: '30px', 
            fontSize: '20px',
            margin: '0 0 30px 0',
            color: '#1f1f1f'
          }}>
            Основные метрики
          </h2>
          
          {/* АДАПТИВНАЯ СЕТКА */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              background: '#e6f7ff', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #1890ff',
              boxShadow: '0 4px 12px rgba(24, 144, 255, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#1890ff',
                marginBottom: '8px'
              }}>
                {metrics.totalMessages}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Всего сообщений
              </div>
            </div>
            
            <div style={{ 
              background: '#f6ffed', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #52c41a',
              boxShadow: '0 4px 12px rgba(82, 196, 26, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#52c41a',
                marginBottom: '8px'
              }}>
                {metrics.totalDialogs}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Всего диалогов
              </div>
            </div>
            
            <div style={{ 
              background: '#fff7e6', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #fa8c16',
              boxShadow: '0 4px 12px rgba(250, 140, 22, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#fa8c16',
                marginBottom: '8px'
              }}>
                {metrics.avgDialogLength}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Сообщений в диалоге
              </div>
            </div>

            <div style={{ 
              background: '#f9f0ff', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #722ed1',
              boxShadow: '0 4px 12px rgba(114, 46, 209, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#722ed1',
                marginBottom: '8px'
              }}>
                {metrics.retentionRate}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Возвращаемость
              </div>
            </div>
            
            <div style={{ 
              background: '#f6ffed', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #52c41a',
              boxShadow: '0 4px 12px rgba(82, 196, 26, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#52c41a',
                marginBottom: '8px'
              }}>
                {metrics.successRate}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Оставили контакты
              </div>
            </div>
            
            <div style={{ 
              background: '#fff2f0', 
              padding: '25px', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #ff4d4f',
              boxShadow: '0 4px 12px rgba(255, 77, 79, 0.1)'
            }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#ff4d4f',
                marginBottom: '8px'
              }}>
                {metrics.failRate}
              </div>
              <div style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Без контактов
              </div>
            </div>
          </div>
          
          {loading && <div style={{ color: '#1890ff', marginTop: '20px', textAlign: 'center', fontSize: '16px' }}>Загрузка данных...</div>}
          {error && <div style={{ color: 'red', marginTop: '20px', textAlign: 'center', fontSize: '16px' }}>{error}</div>}
        </div>

        {/* АДАПТИВНЫЙ ГРАФИК */}
        <div style={{
          background: '#fff',
          padding: '30px',
          marginBottom: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ 
            marginBottom: '20px', 
            fontSize: '18px',
            margin: '0 0 20px 0',
            color: '#1f1f1f'
          }}>
            Динамика сообщений
          </h3>
          <div style={{ marginBottom: '20px' }}>
            <RangePicker
              onChange={dates => setDateRange(dates)}
              format="YYYY-MM-DD"
              allowClear
              size="default"
              style={{ fontSize: '14px' }}
            />
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div style={{ 
              width: '100%', 
              height: '400px'
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={12}
                    interval="preserveStartEnd"
                  />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="messages" 
                    stroke="#1890ff" 
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* АДАПТИВНАЯ ТАБЛИЦА */}
        <div style={{
          background: '#fff',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h3 style={{ 
            marginBottom: '20px', 
            fontSize: '18px',
            margin: '0 0 20px 0',
            color: '#1f1f1f'
          }}>
            Пользователи и диалоги
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <Table 
              columns={columns} 
              dataSource={users} 
              pagination={{ pageSize: 10 }}
              size="default"
              scroll={{ x: 400 }}
              style={{ fontSize: '14px' }}
            />
          </div>
        </div>
      </div>

      <Modal
        open={!!selectedUser}
        onCancel={() => setSelectedUser(null)}
        title="История чата"
        footer={null}
        width="90vw"
        style={{ maxWidth: '800px' }}
      >
        <List
          dataSource={chatLogs[selectedUser] || []}
          renderItem={item => (
            <List.Item style={{ fontSize: '14px' }}>
              <div>
                <b>{item.from === 'user' ? 'Пользователь' : 'Ассистент'}:</b> {item.text}
                <div style={{ color: '#aaa', fontSize: '12px', marginTop: '5px' }}>
                  {dayjs(item.time).format('YYYY-MM-DD HH:mm')}
                </div>
              </div>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}

export default App;