import ReactDOM  from "react-dom";
import UserRegister from '../features/register/components/user-register';

const element = document.getElementById('user-register-container')
if (element) {
  ReactDOM.render(<UserRegister />, element)
}