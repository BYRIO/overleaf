import { useState } from 'react'
import PropTypes from 'prop-types'
import RegisterForm from './register-form'
function UserRegister() {
  const [emails, setEmails] = useState([])
  const [failedEmails, setFailedEmails] = useState([])
  const [registerError, setRegisterError] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)

  return (
    <div className="row">
      <div className="col-md-12">
        <div className="card">
          <div className="page-header">
            <h1> Register New User</h1>
          </div>
          <p> This page only allows email ends with bupt.edu.cn or bupt.cn to register. </p>
          <p> If you use other email address ends with other domain, please contact makiras@bupt.cn .</p>
          <RegisterForm
            setRegistrationSuccess={setRegistrationSuccess}
            setEmails={setEmails}
            setRegisterError={setRegisterError}
            setFailedEmails={setFailedEmails}
          />
          {registerError ? (
            <UserActivateError failedEmails={failedEmails} />
          ) : null}
          {registrationSuccess ? (
            <>
              <SuccessfulRegistrationMessage />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function UserActivateError({ failedEmails }) {
  return (
    <div className="row-spaced text-danger">
      <p>Sorry, an error occured, check your <b>email address</b> or contact makiras@bupt.cn.</p>
    </div>
  )
}

function SuccessfulRegistrationMessage() {
  return (
    <div className="row-spaced text-success bg-success">
      <p>Please check out email for the activation url.</p>
      <p>
        (Password reset tokens will expire after one week and the user will need
        registering again).
      </p>
    </div>
  )
}

UserActivateError.propTypes = {
  failedEmails: PropTypes.array,
}

export default UserRegister
