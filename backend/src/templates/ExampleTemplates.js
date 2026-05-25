export const defaultTemplate = `import java.applet.Applet;
import java.awt.Graphics;
import java.awt.Color;

public class Main extends Applet {
    public void paint(Graphics g) {
        // Set background color
        setBackground(new Color(240, 240, 240));
        
        // Draw some text
        g.setColor(Color.BLUE);
        g.drawString("Welcome to the Java Applet Live Compiler!", 50, 50);
        
        // Draw a classic shape
        g.setColor(Color.RED);
        g.fillOval(50, 80, 100, 100);
        
        // Draw a rectangle
        g.setColor(new Color(0, 150, 0));
        g.fillRect(200, 80, 120, 100);
    }
}
`;

export const animationTemplate = `import java.applet.Applet;
import java.awt.Graphics;
import java.awt.Color;

public class Main extends Applet implements Runnable {
    Thread t;
    int x = 10;
    
    public void init() {
        setBackground(Color.black);
    }
    
    public void start() {
        t = new Thread(this);
        t.start();
    }
    
    public void run() {
        while(true) {
            x += 5;
            if(x > getWidth()) {
                x = -50;
            }
            repaint();
            try {
                Thread.sleep(50);
            } catch(InterruptedException e) {}
        }
    }
    
    public void paint(Graphics g) {
        g.setColor(Color.green);
        g.fillOval(x, 50, 50, 50);
        g.setColor(Color.white);
        g.drawString("Live Animation!", x-15, 40);
    }
}
`;

export const textFieldTemplate = `// Title: Advanced TextField Example
import java.applet.Applet;
import java.awt.Button;
import java.awt.Label;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.Graphics;
import java.awt.Color;
import java.awt.Font;

public class Main extends Applet implements ActionListener {
    Label label;
    TextField textField;
    Button button;
    String message = "";

    public void init() {
        // Set background to white
        setBackground(Color.white);

        label = new Label("Enter Your Name:");
        textField = new TextField(15);
        button = new Button("Submit");

        add(label);
        add(textField);
        add(button);

        button.addActionListener(this);
    }

    public void actionPerformed(ActionEvent e) {
        if (e.getSource() == button) {
            message = "Welcome, " + textField.getText() + "!";
            repaint();
        }
    }

    public void paint(Graphics g) {
        g.setColor(Color.black);
        g.setFont(new Font("sansserif", Font.PLAIN, 14));
        g.drawString(message, 120, 100);
    }
}
`;

