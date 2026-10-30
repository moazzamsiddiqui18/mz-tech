
app.post('/api/orders', (req, res) => {
    const { customerName, productName, quantity } = req.body;

    if (
        !customerName ||
        !productName ||
        !Number.isInteger(quantity) ||
        quantity < 1
    ) {
        return res.status(400).json({
            message: 'Please provide valid order details.'
        });
    }

    res.status(201).json({
        message: 'Order received successfully!',
        order: {
            customerName,
            productName,
            quantity
        }
    });
});
