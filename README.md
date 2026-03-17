# 📚 NEU Library Visitor Portal

Welcome to the **NEU Library Visitor Portal**! This is a modern, full-stack web application designed to streamline library access, track real-time occupancy, and provide insightful analytics for library administrators.

✨ **[Try the App Live Here!](https://remix-neu-library-visitor-app-230692279419.us-west1.run.app)** ✨

---

## 🌟 Features

### For Students & Visitors
*   **Seamless Check-in/Check-out:** Quickly log your visits to the library with just a few clicks.
*   **Visit History:** Keep track of your past visits, including the purpose and duration of your stay.
*   **Real-time Occupancy:** Check how crowded the library is before you even step out of your room!
*   **Interactive Library Map:** Easily navigate through the library's different sections and facilities.
*   **Dark/Light Mode:** Choose the theme that suits your eyes best.

### For Library Officers & Admins
*   **Comprehensive Dashboard:** Get a bird's-eye view of today's visitors, current occupancy, and active users.
*   **Advanced Analytics:** Dive deep into data with visual charts:
    *   Visits by College (Donut Chart)
    *   Purpose of Visit (Progress Bars)
    *   Peak Hours Density (Bar Chart)
    *   College Engagement Ranking
*   **User Management:** Easily add, edit, block, or delete users. Assign roles (Student, Library Officer, Admin) to control access.
*   **System Activity Logs:** Monitor all check-ins, check-outs, and administrative actions in real-time.
*   **Printable Reports:** Generate and print PDF reports of library usage statistics.

---

## 🛠️ Tech Stack

This project is built using modern web technologies to ensure performance, scalability, and a great developer experience:

*   **Frontend Framework:** [React 18](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool:** [Vite](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) for rapid, utility-first styling.
*   **Icons:** [Lucide React](https://lucide.dev/) for beautiful, consistent iconography.
*   **Animations:** [Motion (Framer Motion)](https://motion.dev/) for smooth, fluid UI transitions.
*   **Backend & Database:** [Firebase](https://firebase.google.com/)
    *   **Authentication:** Secure login and registration (restricted to `@neu.edu.ph` emails).
    *   **Firestore:** Real-time NoSQL database for storing user profiles, visit logs, and system stats.
*   **Charts:** [Recharts](https://recharts.org/) for rendering responsive and interactive data visualizations.

---

## 🚀 Getting Started (Local Development)

If you want to run this project locally, follow these steps:

### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn
*   A Firebase project with Authentication and Firestore enabled.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd neu-library-portal
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Firebase:**
    *   Create a `.env` file in the root directory.
    *   Add your Firebase configuration variables (you can find these in your Firebase project settings).

4.  **Start the development server:**
    ```bash
    npm run dev
    ```

5.  Open your browser and navigate to `http://localhost:3000`.

---

## 💡 Usage Guide

### Logging In
*   The application restricts access to users with a valid `@neu.edu.ph` email address.
*   You can sign up using the registration form or use Google Sign-In.

### Admin Access
*   To access the Admin Dashboard, your account must have the `admin` or `library officer` role.
*   *Note for testing:* The system includes a "Populate Sample Data" button in the Admin Analytics and Dashboard sections to quickly generate mock users and visit logs for testing purposes.

---

## 🎨 Design Philosophy

The UI/UX is built with a "Glassmorphism" aesthetic, utilizing semi-transparent backgrounds, subtle borders, and vibrant accent colors (blue, emerald, purple) to create a modern, engaging, and clean interface. The layout is fully responsive, ensuring a seamless experience across desktop, tablet, and mobile devices.

---

Made with ❤️ for New Era University.   
Creator: Nerecina, John Lian R. (@JLNerecina)  
