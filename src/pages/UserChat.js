import { useParams } from 'react-router-dom';

function UserChat() {
  const { userId } = useParams();
  return <h1>История чата пользователя: {userId}</h1>;
}
export default UserChat;

